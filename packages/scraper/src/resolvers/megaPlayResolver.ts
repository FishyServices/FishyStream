import { isFetchableUrl, isRecord, resolveMediaCandidate } from "../media";
import type { StreamHeaders, StreamResult } from "../types";

const MEGAPLAY_ORIGIN = "https://megaplay.buzz";
const MEGAPLAY_HOST = "megaplay.buzz";
const DEFAULT_TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// apikuoshi src/sources/kaze/helper/cdn.helper.js
const SOURCE_ENC_KEY = "i?LMTAx0Q6,:}50U";
const SOURCE_ENC_IV = "W0;27ToaUpl_P%'c";
const CDN_TOKEN_SECRET = "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
const CDN_TOKEN_TTL_SECONDS = 90;

// providerRegistry.ts servers
const SERVER_IDS = ["default", "bcdn", "tcdn"] as const;
type ServerId = (typeof SERVER_IDS)[number];

type MegaPlayRequest = {
  kind: "ani" | "mal";
  id: string;
  episode: string;
  audio: "sub" | "dub";
  server: ServerId;
};

export type MegaPlayOptions = {
  timeoutMs?: number;
};

function parseTarget(targetUrl: string): MegaPlayRequest | null {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== MEGAPLAY_HOST || parsed.port) {
      return null;
    }
    const parts = parsed.pathname.split("/").filter(Boolean);
    const [root, kind, id, episode, audio] = parts;
    if (parts.length !== 5 || root !== "stream") return null;
    if (kind !== "ani" && kind !== "mal") return null;
    if (audio !== "sub" && audio !== "dub") return null;
    if (!id || !episode || !/^\d+$/.test(id) || !/^\d+$/.test(episode)) return null;
    const requested = parsed.searchParams.get("s");
    const server = SERVER_IDS.find((candidate) => candidate === requested) ?? "default";
    return { kind, id, episode, audio, server };
  } catch {
    return null;
  }
}

function serverOrder(first: ServerId): ServerId[] {
  return [first, ...SERVER_IDS.filter((server) => server !== first)];
}

function pageUrl(request: MegaPlayRequest, server: ServerId): string {
  const base = `${MEGAPLAY_ORIGIN}/stream/${request.kind}/${request.id}/${request.episode}/${request.audio}`;
  return server === "default" ? base : `${base}?s=${server}`;
}

async function fetchBody(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function findDataId(html: string): string | null {
  const player = html.match(/<[^>]*\bid=["']megaplay-player["'][^>]*>/i);
  const fromPlayer = player?.[0].match(/\bdata-id=["'](\d+)["']/i);
  if (fromPlayer?.[1]) return fromPlayer[1];
  return html.match(/\bdata-id=["'](\d+)["']/i)?.[1] ?? null;
}

function utf8(value: string, length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length);
  bytes.set(new TextEncoder().encode(value).subarray(0, length));
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function decryptSources(enc: string): Promise<unknown | null> {
  const data = base64UrlToBytes(enc);
  if (!data || data.length === 0 || data.length % 16 !== 0) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      utf8(SOURCE_ENC_KEY, 32),
      { name: "AES-CBC" },
      false,
      ["decrypt"]
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-CBC", iv: utf8(SOURCE_ENC_IV, 16) },
      key,
      data
    );
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    return null;
  }
}

async function readSourceFile(payload: unknown): Promise<string | null> {
  if (!isRecord(payload)) return null;
  if (typeof payload.enc === "string") {
    const decrypted = await decryptSources(payload.enc);
    return isRecord(decrypted) && typeof decrypted.file === "string" ? decrypted.file : null;
  }
  const sources = payload.sources;
  return isRecord(sources) && typeof sources.file === "string" ? sources.file : null;
}

function cdnPathKey(url: string): string | null {
  try {
    const match = new URL(url).pathname.match(/\/([a-f0-9]{32})\/([a-f0-9]{32})\//i);
    return match ? `${match[1]?.toLowerCase()}/${match[2]?.toLowerCase()}` : null;
  } catch {
    return null;
  }
}

async function withCdnToken(url: string): Promise<string | null> {
  const pathKey = cdnPathKey(url);
  if (!pathKey) return url;
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("token")) return url;
    const payload = `${Math.floor(Date.now() / 1000) + CDN_TOKEN_TTL_SECONDS}|${pathKey}`;
    const key = await crypto.subtle.importKey(
      "raw",
      utf8(CDN_TOKEN_SECRET, CDN_TOKEN_SECRET.length),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    parsed.searchParams.set(
      "token",
      `${bytesToBase64Url(new TextEncoder().encode(payload))}.${bytesToBase64Url(new Uint8Array(signature))}`
    );
    return parsed.href;
  } catch {
    return null;
  }
}

function isDemoMedia(url: string): boolean {
  return /\/demo-video\.mp4(?:[?#]|$)/i.test(url);
}

async function probeMedia(
  url: string,
  mediaType: "hls" | "file",
  headers: StreamHeaders,
  timeoutMs: number
): Promise<boolean> {
  const requestHeaders: Record<string, string> = { "User-Agent": USER_AGENT };
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") requestHeaders[name] = value;
  }
  if (mediaType === "file") requestHeaders.Range = "bytes=0-1023";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: requestHeaders, signal: controller.signal });
    if (mediaType === "hls") {
      if (!response.ok) return false;
      const body = (await response.text()).replace(/^\uFEFF/, "");
      return body.startsWith("#EXTM3U");
    }
    const contentType = response.headers.get("content-type") ?? "";
    const valid =
      (response.status === 200 || response.status === 206) &&
      !/^text\/|html|json|xml/i.test(contentType);
    await response.body?.cancel().catch(() => undefined);
    return valid;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readTracks(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const tracks: unknown[] = [];
  for (const track of value) {
    if (!isRecord(track) || typeof track.file !== "string") continue;
    if (typeof track.kind === "string" && /thumbnail/i.test(track.kind)) continue;
    let file: string;
    try {
      file = new URL(track.file, MEGAPLAY_ORIGIN).href;
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(file) || !isFetchableUrl(file) || seen.has(file)) continue;
    seen.add(file);
    tracks.push({
      file,
      ...(typeof track.label === "string" ? { label: track.label } : {}),
      ...(typeof track.kind === "string" ? { kind: track.kind } : {}),
      ...(typeof track.default === "boolean" ? { default: track.default } : {})
    });
  }
  return tracks.length > 0 ? tracks : undefined;
}

function readSkipRange(value: unknown): { start: number; end: number } | undefined {
  if (!isRecord(value)) return undefined;
  const { start, end } = value;
  return typeof start === "number" &&
    typeof end === "number" &&
    Number.isFinite(start) &&
    Number.isFinite(end)
    ? { start, end }
    : undefined;
}

async function resolveServer(
  request: MegaPlayRequest,
  server: ServerId,
  timeoutMs: number
): Promise<StreamResult | null> {
  try {
    const embedUrl = pageUrl(request, server);
    const html = await fetchBody(
      embedUrl,
      { "User-Agent": USER_AGENT, Accept: "text/html, */*", Referer: `${MEGAPLAY_ORIGIN}/` },
      timeoutMs
    );
    const dataId = html ? findDataId(html) : null;
    if (!dataId) return null;

    // /stream/getSources?id=<data-id>&platform=OTHER
    const sourcesUrl = `${MEGAPLAY_ORIGIN}/stream/getSources?id=${dataId}&platform=OTHER`;
    const body = await fetchBody(
      sourcesUrl,
      {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest",
        Referer: embedUrl,
        Origin: MEGAPLAY_ORIGIN
      },
      timeoutMs
    );
    if (!body) return null;
    const payload: unknown = JSON.parse(body);
    const file = await readSourceFile(payload);
    if (!file || isDemoMedia(file)) return null;

    const candidate = resolveMediaCandidate(file, undefined, MEGAPLAY_ORIGIN);
    if (!candidate || isDemoMedia(candidate.url)) return null;
    const url = await withCdnToken(candidate.url);
    if (!url) return null;

    const headers: StreamHeaders = { Referer: `${MEGAPLAY_ORIGIN}/`, Origin: MEGAPLAY_ORIGIN };
    if (!(await probeMedia(url, candidate.mediaType, headers, timeoutMs))) return null;

    const record = payload as Record<string, unknown>;
    const tracks = readTracks(record.tracks);
    const intro = readSkipRange(record.intro);
    const outro = readSkipRange(record.outro);
    return {
      url,
      mediaType: candidate.mediaType,
      headers,
      ...(tracks ? { tracks } : {}),
      ...(intro ? { intro } : {}),
      ...(outro ? { outro } : {})
    };
  } catch {
    return null;
  }
}

export async function resolveMegaPlay(
  targetUrl: string,
  options: MegaPlayOptions = {}
): Promise<StreamResult | null> {
  try {
    const request = parseTarget(targetUrl);
    if (!request) return null;
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    for (const server of serverOrder(request.server)) {
      const stream = await resolveServer(request, server, timeoutMs);
      if (stream) return stream;
    }
    return null;
  } catch {
    return null;
  }
}
