import { fetchWithRetry, INSECURE_TLS } from "../fetcher";
import { isHttpUrl, originHeaders, resolveMedia } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const API_ORIGIN = "https://new.vidnest.fun";
const STANDARD_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
const CUSTOM_ALPHABET = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";

type Request = {
  id: string;
  type: "movie" | "tv" | "anime";
  season?: string;
  episode?: string;
  language?: "dub" | "sub";
};

const SOURCE_PATHS = [
  "yflix/movie",
  "rogflix/movie",
  "vidrock/movie",
  "vidzee/movie",
  "nextgencloudfabric/movie",
  "superstream/movie",
  "videasy/movie",
  "klikxxi/movie",
  "hollymoviehd",
  "allmovies/movie",
  "vidlink/movie"
] as const;

const ANIME_SOURCE_PATHS = ["animehub", "aniwave_hls", "hianime/anime"] as const;

function parseRequest(value: string): Request | null {
  try {
    const url = new URL(value);
    if (url.hostname !== "vidnest.fun") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const id = parts[1];
    if (!id || (type !== "movie" && type !== "tv" && type !== "anime")) return null;
    if (!/^\d+$/.test(id)) return null;
    if (type === "movie") return { id, type };
    if (type === "anime") {
      if (!parts[2] || (parts[3] !== "dub" && parts[3] !== "sub") || !/^\d+$/.test(parts[2]))
        return null;
      return { id, type, episode: parts[2], language: parts[3] };
    }
    if (!parts[2] || !parts[3] || !/^\d+$/.test(parts[2]) || !/^\d+$/.test(parts[3])) return null;
    return { id, type, season: parts[2], episode: parts[3] };
  } catch {
    return null;
  }
}

function decrypt(value: string): unknown | null {
  try {
    let standard = "";
    for (const character of value) {
      const index = CUSTOM_ALPHABET.indexOf(character);
      if (index < 0) return null;
      standard += STANDARD_ALPHABET[index];
    }
    const binary = atob(standard);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

function unwrap(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return record.encrypted === true && typeof record.data === "string"
    ? decrypt(record.data)
    : value;
}

function streamFrom(value: unknown, base: string): Stream | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== "string") return null;
  const stream = resolveMedia(record.url, base, record.type);
  if (!stream || !isHttpUrl(stream.url)) return null;
  const headers: StreamHeaders = {};
  if (record.headers && typeof record.headers === "object" && !Array.isArray(record.headers)) {
    for (const [name, header] of Object.entries(record.headers)) {
      if (typeof header === "string" && header) headers[name] = header;
    }
  }
  return { ...stream, headers, ...(record.tracks ? { tracks: record.tracks } : {}) };
}

function findStream(value: unknown, base: string): Stream | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const direct = streamFrom(record, base);
  if (direct) return direct;
  const nested =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? streamFrom((record.data as Record<string, unknown>).stream, base)
      : null;
  if (nested) return nested;
  for (const key of ["sources", "streams"]) {
    const entries = record[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const stream = streamFrom(entry, base);
      if (stream) return stream;
    }
  }
  return null;
}

function sourceUrl(sourcePath: string, request: Request): string {
  const path =
    request.type === "movie"
      ? `${sourcePath}/${request.id}`
      : request.type === "anime"
        ? sourcePath === "hianime/anime"
          ? `${sourcePath}/${request.id}/${request.episode}/${request.language}/hd-2`
          : `${sourcePath}/${request.id}/${request.episode}/${request.language}`
        : `${sourcePath.replace(/\/movie$/, "/tv")}/${request.id}/${request.season}/${request.episode}`;
  return new URL(`/${path}`, API_ORIGIN).href;
}

const log = (...args: unknown[]) => console.log("[vidnest]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 300);
}

async function fetchJson(url: string, referer: string): Promise<unknown | null> {
  const started = Date.now();
  try {
    const response = await fetchWithRetry(url, {
      Accept: "application/json, text/plain, */*",
      Referer: referer,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    });
    log(`GET ${url} -> ${response.status} (${Date.now() - started}ms)`);
    if (!response.ok) {
      log("  body:", preview(await response.text().catch(() => "")));
      return null;
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      log("  response was not JSON:", preview(text));
      return null;
    }
  } catch (error) {
    log(`GET ${url} threw after ${Date.now() - started}ms:`, error);
    return null;
  }
}

async function probe(stream: Stream): Promise<boolean> {
  if (/\/demo-video\.mp4(?:[?#]|$)/i.test(stream.url)) {
    log("  rejected demo media URL");
    return false;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ...(Object.keys(stream.headers).length ? stream.headers : originHeaders(stream.url)),
    ...(stream.mediaType === "file" ? { Range: "bytes=0-1023" } : {})
  };
  try {
    const response = await fetch(stream.url, {
      headers,
      signal: controller.signal,
      ...INSECURE_TLS
    });
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      const playable = response.ok && body.startsWith("#EXTM3U");
      log(`  probe hls -> ${response.status}${playable ? " ok" : ` bad: ${preview(body)}`}`);
      return playable;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    const playable =
      (response.status === 200 || response.status === 206) &&
      !/text\/|html|json|xml/.test(contentType);
    log(`  probe file -> ${response.status} ${contentType}${playable ? " ok" : " rejected"}`);
    return playable;
  } catch (error) {
    log("  media probe failed:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveVidNest(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse request from", target);
    return null;
  }
  log("request:", JSON.stringify(request));
  const referer = "https://vidnest.fun/";
  const paths = request.type === "anime" ? ANIME_SOURCE_PATHS : SOURCE_PATHS;
  for (const path of paths) {
    const url = sourceUrl(path, request);
    const payload = await fetchJson(url, referer);
    if (payload === null) continue;
    log("  raw payload:", preview(payload));
    const unwrapped = unwrap(payload);
    if (unwrapped === null) {
      log("  decrypt failed");
      continue;
    }
    log("  unwrapped:", preview(unwrapped));
    const stream = findStream(unwrapped, new URL(url).origin);
    if (stream) {
      log(`  candidate ${stream.mediaType} stream via ${path}:`, stream.url);
      if (await probe(stream)) {
        log(`  FOUND ${stream.mediaType} stream via ${path}`);
        return stream;
      }
      log("  candidate failed media probe; trying next source");
      continue;
    }
    log("  no stream in payload");
  }
  log("all sources exhausted");
  return null;
}
