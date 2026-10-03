import { findMedia, isHttpUrl, originHeaders } from "../media";
import type { MediaType, Stream, StreamHeaders } from "../../types";

const ORIGIN = "https://peachify.top";
const SERVER_API = "https://x.eat-peach.sbs";
const DECODER_API = "https://enc-dec.app/api/dec-peachify";
const TIMEOUT_MS = 6000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const SERVERS = [
  { label: "Multi", path: "multi" },
  { label: "Horizon", path: "hr" },
  { label: "Spider", path: "holly" },
  { label: "Wolf", path: "air" },
  { label: "Iron", path: "moviebox" }
] as const;

type Request =
  { type: "movie"; id: string } | { type: "tv"; id: string; season: string; episode: string };

const PROVIDER_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Origin: ORIGIN,
  Referer: `${ORIGIN}/`
};

const log = (...args: unknown[]) => console.log("[peachify]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validNumber(value: string | undefined, minimum: number): string | null {
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const number = Number(value);
  return number >= minimum ? String(number) : null;
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.hostname !== "peachify.top") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "embed" || !parts[2] || !/^\d{1,10}$/.test(parts[2]) || Number(parts[2]) < 1)
      return null;
    if (parts[1] === "movie" && parts.length === 3) return { type: "movie", id: parts[2] };
    if (parts[1] !== "tv" || parts.length !== 5) return null;
    const season = validNumber(parts[3], 0);
    const episode = validNumber(parts[4], 1);
    return season && episode ? { type: "tv", id: parts[2], season, episode } : null;
  } catch {
    return null;
  }
}

async function fetchJson(label: string, url: string, init: RequestInit): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    log(`${label} -> ${response.status} (${Date.now() - started}ms)`);
    const text = await response.text();
    if (!response.ok) {
      log("  body:", preview(text));
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      log("  response was not JSON:", preview(text));
      return null;
    }
  } catch (error) {
    log(
      `${label} failed after ${Date.now() - started}ms:`,
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readTracks(value: unknown): unknown[] | undefined {
  if (!isRecord(value)) return undefined;
  const source = value.tracks ?? value.subtitles ?? value.captions;
  if (!Array.isArray(source)) return undefined;
  const seen = new Set<string>();
  const tracks = source.flatMap((track) => {
    if (!isRecord(track)) return [];
    const raw = track.file ?? track.url;
    if (typeof raw !== "string") return [];
    try {
      const file = new URL(raw, ORIGIN).href;
      if (!isHttpUrl(file) || seen.has(file)) return [];
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

function streamHeaders(mediaUrl: string): StreamHeaders {
  return {
    "User-Agent": USER_AGENT,
    ...originHeaders(mediaUrl),
    Origin: ORIGIN,
    Referer: `${ORIGIN}/`
  };
}

async function probe(url: string, mediaType: MediaType, headers: StreamHeaders): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { ...headers, ...(mediaType === "file" ? { Range: "bytes=0-1023" } : {}) },
      signal: controller.signal,
    });
    if (mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      const ok = response.ok && body.startsWith("#EXTM3U");
      log(`  probe hls -> ${response.status}${ok ? " ok" : ` bad: ${preview(body)}`}`);
      return ok;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    log(`  probe file -> ${response.status} ${contentType}`);
    return response.ok && !/text\/|html|json|xml/.test(contentType);
  } catch (error) {
    log("  probe failed:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveServer(
  request: Request,
  server: (typeof SERVERS)[number]
): Promise<Stream | null> {
  log(`trying ${server.label} (${server.path})`);
  const path =
    request.type === "movie"
      ? `${server.path}/movie/${request.id}`
      : `${server.path}/tv/${request.id}/${request.season}/${request.episode}`;
  const encrypted = await fetchJson(`${server.label} sources`, `${SERVER_API}/${path}`, {
    headers: PROVIDER_HEADERS
  });
  if (!isRecord(encrypted) || typeof encrypted.data !== "string" || !encrypted.data) {
    log("  no encrypted data in response:", preview(encrypted));
    return null;
  }

  const decodedResponse = await fetchJson("decoder", DECODER_API, {
    method: "POST",
    headers: {
      ...PROVIDER_HEADERS,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ text: encrypted.data })
  });
  if (
    !isRecord(decodedResponse) ||
    decodedResponse.status !== 200 ||
    !("result" in decodedResponse)
  ) {
    log("  decoder failed:", preview(decodedResponse));
    return null;
  }
  const decoded = decodedResponse.result;
  log("  decoded:", preview(decoded));

  const found = findMedia(decoded, ORIGIN);
  if (!found || /(?:demo-video|sample-video)\.mp4(?:[?#]|$)/i.test(found.url)) {
    log("  no playable media in decoded payload");
    return null;
  }
  const headers = streamHeaders(found.url);
  if (!(await probe(found.url, found.mediaType, headers))) return null;
  const tracks = readTracks(decoded);
  log(`FOUND ${found.mediaType} stream via ${server.label}:`, found.url);
  return { url: found.url, mediaType: found.mediaType, headers, ...(tracks ? { tracks } : {}) };
}

export async function resolvePeachify(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse request from", target);
    return null;
  }
  log("request:", JSON.stringify(request));
  for (const server of SERVERS) {
    const stream = await resolveServer(request, server);
    if (stream) return stream;
  }
  log("all servers exhausted");
  return null;
}
