import {
  findPlayableMediaInObject,
  getOriginHeaders,
  isFetchableUrl,
  isRecord,
  resolveMediaCandidate
} from "../media";
import type { StreamHeaders, StreamResult } from "../types";

const PEACHIFY_ORIGIN = "https://peachify.top";
const SERVER_API = "https://x.eat-peach.sbs";
const DECODER_API = "https://enc-dec.app/api/dec-peachify";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 6000;

const SERVERS = [
  { label: "Multi", path: "multi" },
  { label: "Horizon", path: "hr" },
  { label: "Spider", path: "holly" },
  { label: "Wolf", path: "air" },
  { label: "Iron", path: "moviebox" }
] as const;

type PeachifyRequest =
  { type: "movie"; id: string } | { type: "tv"; id: string; season: string; episode: string };

export type PeachifyOptions = { timeoutMs?: number };

const providerHeaders: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Origin: PEACHIFY_ORIGIN,
  Referer: `${PEACHIFY_ORIGIN}/`
};

function validNumber(value: string | undefined, minimum: number): string | null {
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const number = Number(value);
  return number >= minimum ? String(number) : null;
}

function parseRequest(targetUrl: string): PeachifyRequest | null {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.hostname !== "peachify.top") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "embed" || !parts[2] || !/^\d{1,10}$/.test(parts[2])) return null;
    if (Number(parts[2]) < 1) return null;
    if (parts[1] === "movie" && parts.length === 3) return { type: "movie", id: parts[2] };
    if (parts[1] !== "tv" || parts.length !== 5) return null;
    const season = validNumber(parts[3], 0);
    const episode = validNumber(parts[4], 1);
    return season && episode ? { type: "tv", id: parts[2], season, episode } : null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (response: Response) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await read(await fetch(url, { ...init, signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

function cleanHeaders(headers: StreamHeaders): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  try {
    return await fetchWithTimeout(url, init, timeoutMs, async (response) => {
      if (!response.ok) return null;
      try {
        return (await response.json()) as unknown;
      } catch {
        return null;
      }
    });
  } catch {
    return null;
  }
}

function readEncryptedData(value: unknown): string | null {
  return isRecord(value) && typeof value.data === "string" && value.data.length > 0
    ? value.data
    : null;
}

function readDecoderResult(value: unknown): unknown | null {
  if (!isRecord(value) || value.status !== 200 || !("result" in value)) return null;
  return value.result;
}

function readTracks(value: unknown, base: string): unknown[] | undefined {
  if (!isRecord(value)) return undefined;
  const source = value.tracks ?? value.subtitles ?? value.captions;
  if (!Array.isArray(source)) return undefined;
  const seen = new Set<string>();
  const tracks = source.flatMap((track) => {
    if (!isRecord(track)) return [];
    const rawUrl = track.file ?? track.url;
    if (typeof rawUrl !== "string") return [];
    try {
      const file = new URL(rawUrl, base).href;
      if (!isFetchableUrl(file) || seen.has(file)) return [];
      seen.add(file);
      const label =
        typeof track.label === "string"
          ? track.label
          : typeof track.lang === "string"
            ? track.lang
            : "";
      return [{ ...(label ? { label } : {}), file, type: "vtt" }];
    } catch {
      return [];
    }
  });
  return tracks.length > 0 ? tracks : undefined;
}

async function isPlayableMedia(
  candidate: { url: string; mediaType: "hls" | "file" },
  headers: StreamHeaders,
  timeoutMs: number
): Promise<boolean> {
  try {
    return await fetchWithTimeout(
      candidate.url,
      {
        headers: cleanHeaders({
          ...headers,
          ...(candidate.mediaType === "file" ? { Range: "bytes=0-1023" } : {})
        })
      },
      timeoutMs,
      async (response) => {
        if (!response.ok) return false;
        if (candidate.mediaType === "hls") {
          return (await response.text())
            .replace(/^\uFEFF/, "")
            .trimStart()
            .startsWith("#EXTM3U");
        }
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        await response.body?.cancel();
        return !/text\/|html|json|xml/.test(contentType);
      }
    );
  } catch {
    return false;
  }
}

function streamHeaders(mediaUrl: string): StreamHeaders {
  return {
    "User-Agent": USER_AGENT,
    ...getOriginHeaders(mediaUrl),
    Origin: PEACHIFY_ORIGIN,
    Referer: `${PEACHIFY_ORIGIN}/`
  };
}

async function resolveServer(
  request: PeachifyRequest,
  serverPath: string,
  timeoutMs: number
): Promise<StreamResult | null> {
  try {
    const path =
      request.type === "movie"
        ? `${serverPath}/movie/${request.id}`
        : `${serverPath}/tv/${request.id}/${request.season}/${request.episode}`;
    const encrypted = await fetchJson(
      `${SERVER_API}/${path}`,
      { headers: cleanHeaders(providerHeaders) },
      timeoutMs
    );
    const data = readEncryptedData(encrypted);
    if (!data) return null;

    const decodedResponse = await fetchJson(
      DECODER_API,
      {
        method: "POST",
        headers: {
          ...cleanHeaders(providerHeaders),
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({ text: data })
      },
      timeoutMs
    );
    const decoded = readDecoderResult(decodedResponse);
    if (decoded === null) return null;
    const candidate = findPlayableMediaInObject(decoded, PEACHIFY_ORIGIN);
    if (!candidate || /(?:demo-video|sample-video)\.mp4(?:[?#]|$)/i.test(candidate.url))
      return null;
    const directCandidate = resolveMediaCandidate(
      candidate.url,
      candidate.mediaType,
      PEACHIFY_ORIGIN
    );
    if (
      !directCandidate ||
      !(await isPlayableMedia(directCandidate, streamHeaders(directCandidate.url), timeoutMs))
    ) {
      return null;
    }
    const tracks = readTracks(decoded, PEACHIFY_ORIGIN);
    return {
      url: directCandidate.url,
      mediaType: directCandidate.mediaType,
      headers: streamHeaders(directCandidate.url),
      ...(tracks ? { tracks } : {})
    };
  } catch {
    return null;
  }
}

export async function resolvePeachify(
  targetUrl: string,
  options: PeachifyOptions = {}
): Promise<StreamResult | null> {
  const request = parseRequest(targetUrl);
  if (!request) return null;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  for (const server of SERVERS) {
    const stream = await resolveServer(request, server.path, timeoutMs);
    if (stream) return stream;
  }
  return null;
}
