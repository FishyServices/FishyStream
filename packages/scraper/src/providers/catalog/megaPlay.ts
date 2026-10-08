import { INSECURE_TLS } from "../fetcher";
import { isHttpUrl, resolveMedia } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const ORIGIN = "https://megaplay.buzz";
const HOST = "megaplay.buzz";
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const SOURCE_ENC_KEY = "i?LMTAx0Q6,:}50U";
const SOURCE_ENC_IV = "W0;27ToaUpl_P%'c";
const CDN_TOKEN_SECRET = "MpCdnT0k3n!9f2K#xQ7vL5mR8wN1pY4s";
const CDN_TOKEN_TTL_SECONDS = 90;

const SERVER_IDS = ["default", "bcdn", "tcdn"] as const;
type ServerId = (typeof SERVER_IDS)[number];

type Request = {
  kind: "ani" | "mal";
  id: string;
  episode: string;
  audio: "sub" | "dub";
  server: ServerId;
};

const log = (...args: unknown[]) => console.log("[megaplay]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== HOST || url.port) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [root, kind, id, episode, audio] = parts;
    if (parts.length !== 5 || root !== "stream") return null;
    if (kind !== "ani" && kind !== "mal") return null;
    if (audio !== "sub" && audio !== "dub") return null;
    if (!id || !episode || !/^\d+$/.test(id) || !/^\d+$/.test(episode)) return null;
    const requested = url.searchParams.get("s");
    const server = SERVER_IDS.find((candidate) => candidate === requested) ?? "default";
    return { kind, id, episode, audio, server };
  } catch {
    return null;
  }
}

function pageUrl(request: Request, server: ServerId): string {
  const base = `${ORIGIN}/stream/${request.kind}/${request.id}/${request.episode}/${request.audio}`;
  return server === "default" ? base : `${base}?s=${server}`;
}

async function fetchText(
  label: string,
  url: string,
  headers: Record<string, string>
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    log(`${label} GET ${url} -> ${response.status} (${Date.now() - started}ms)`);
    const body = await response.text();
    if (!response.ok) {
      log("  body:", preview(body));
      return null;
    }
    return body;
  } catch (error) {
    log(`${label} GET ${url} threw after ${Date.now() - started}ms:`, error);
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
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
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
  if (!data || data.length === 0 || data.length % 16 !== 0) {
    log("  enc payload has invalid length", data?.length);
    return null;
  }
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
  } catch (error) {
    log("  AES decrypt failed (key/iv may have changed):", error);
    return null;
  }
}

async function readSourceFile(payload: unknown): Promise<string | null> {
  if (!isRecord(payload)) return null;
  if (typeof payload.enc === "string") {
    const decrypted = await decryptSources(payload.enc);
    log("  decrypted:", preview(decrypted));
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
  } catch (error) {
    log("  token signing failed:", error);
    return null;
  }
}

const isDemoMedia = (url: string): boolean => /\/demo-video\.mp4(?:[?#]|$)/i.test(url);

async function probeMedia(
  url: string,
  mediaType: "hls" | "file",
  headers: StreamHeaders
): Promise<boolean> {
  const requestHeaders: Record<string, string> = { "User-Agent": USER_AGENT, ...headers };
  if (mediaType === "file") requestHeaders.Range = "bytes=0-1023";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: requestHeaders,
      signal: controller.signal,
      ...INSECURE_TLS
    });
    if (mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "");
      const ok = response.ok && body.startsWith("#EXTM3U");
      log(`  probe hls -> ${response.status}${ok ? " ok" : ` bad: ${preview(body)}`}`);
      return ok;
    }
    const contentType = response.headers.get("content-type") ?? "";
    const ok =
      (response.status === 200 || response.status === 206) &&
      !/^text\/|html|json|xml/i.test(contentType);
    log(`  probe file -> ${response.status} ${contentType}`);
    await response.body?.cancel().catch(() => undefined);
    return ok;
  } catch (error) {
    log("  probe threw, accepting stream anyway:", error);
    return true;
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
      file = new URL(track.file, ORIGIN).href;
    } catch {
      continue;
    }
    if (!isHttpUrl(file) || seen.has(file)) continue;
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

async function resolveServer(request: Request, server: ServerId): Promise<Stream | null> {
  log(`trying server "${server}"`);
  const embedUrl = pageUrl(request, server);
  const html = await fetchText("embed", embedUrl, {
    "User-Agent": USER_AGENT,
    Accept: "text/html, */*",
    Referer: `${ORIGIN}/`
  });
  if (!html) return null;
  const dataId = findDataId(html);
  if (!dataId) {
    log("  no data-id in embed page:", preview(html));
    return null;
  }
  log("  data-id:", dataId);

  const body = await fetchText(
    "sources",
    `${ORIGIN}/stream/getSources?id=${dataId}&platform=OTHER`,
    {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: embedUrl,
      Origin: ORIGIN
    }
  );
  if (!body) return null;
  log("  raw payload:", preview(body));
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    log("  getSources response was not JSON");
    return null;
  }

  const file = await readSourceFile(payload);
  if (!file) {
    log("  no file in payload");
    return null;
  }
  if (isDemoMedia(file)) {
    log("  got demo video, skipping:", file);
    return null;
  }
  const candidate = resolveMedia(file, ORIGIN);
  if (!candidate || isDemoMedia(candidate.url)) {
    log("  file is not a recognised media url:", file);
    return null;
  }
  const url = await withCdnToken(candidate.url);
  if (!url) return null;

  const headers: StreamHeaders = { Referer: `${ORIGIN}/`, Origin: ORIGIN };
  if (!(await probeMedia(url, candidate.mediaType, headers))) return null;

  const record = payload as Record<string, unknown>;
  const tracks = readTracks(record.tracks);
  const intro = readSkipRange(record.intro);
  const outro = readSkipRange(record.outro);
  log(`FOUND ${candidate.mediaType} stream via "${server}":`, url);
  return {
    url,
    mediaType: candidate.mediaType,
    headers,
    ...(tracks ? { tracks } : {}),
    ...(intro ? { intro } : {}),
    ...(outro ? { outro } : {})
  };
}

export async function resolveMegaPlay(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse request from", target);
    return null;
  }
  log("request:", JSON.stringify(request));
  for (const server of [
    request.server,
    ...SERVER_IDS.filter((candidate) => candidate !== request.server)
  ]) {
    try {
      const stream = await resolveServer(request, server);
      if (stream) return stream;
    } catch (error) {
      log(`server "${server}" threw:`, error);
    }
  }
  log("all servers exhausted");
  return null;
}
