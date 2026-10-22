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
  language?: string;
};

const ANIME_SOURCE_PATHS = ["animehub", "aniwave_hls", "hianime/anime"] as const;
const MAX_PLAYER_SCRIPTS = 50;
const SOURCE_PATH_TTL_MS = 60_000;
const playerCodeCache = new Map<string, { scripts: string[]; expiresAt: number }>();

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
      const language = parts[3];
      if (!parts[2] || !language || !/^[a-z]+$/i.test(language) || !/^\d+$/.test(parts[2]))
        return null;
      return { id, type, episode: parts[2], language: language.toLowerCase() };
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

async function decryptV2(data: string, nonce: string, secret: string): Promise<unknown | null> {
  try {
    const encoded = data.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(encoded + "=".repeat((4 - (encoded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const iv = bytes.slice(0, 12);
    const encrypted = bytes.slice(12);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${nonce}|${secret}`)
    );
    const key = await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["decrypt"]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
    const text = new TextDecoder().decode(plaintext);
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

async function unwrap(value: unknown, secret: string | null): Promise<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (record.v === 2 && typeof record.d === "string" && typeof record.n === "string" && secret) {
    return decryptV2(record.d, record.n, secret);
  }
  return record.encrypted === true && typeof record.data === "string"
    ? decrypt(record.data)
    : value;
}

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
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

function findStreams(value: unknown, base: string): Stream[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const streams: Stream[] = [];
  const direct = streamFrom(record, base);
  if (direct) streams.push(direct);
  const nested =
    record.data && typeof record.data === "object" && !Array.isArray(record.data)
      ? streamFrom((record.data as Record<string, unknown>).stream, base)
      : null;
  if (nested) streams.push(nested);
  for (const key of ["sources", "streams"]) {
    const entries = record[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const stream = streamFrom(entry, base);
      if (stream) streams.push(stream);
    }
  }
  return streams;
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

async function fetchPlayerText(url: string, referer: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(url, {
      Accept: "text/html, text/javascript, application/javascript, */*",
      Referer: referer,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    });
    return response.ok ? await response.text() : null;
  } catch (error) {
    log(`player asset request failed for ${url}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

function addPlayerScripts(text: string, base: string, queue: string[]): void {
  for (const match of text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)) {
    try {
      const scriptUrl = new URL(match[1]!, base);
      if (scriptUrl.origin === new URL(base).origin) queue.push(scriptUrl.href);
    } catch {
      continue;
    }
  }
  for (const match of text.matchAll(/["'`]([^"'`]+\.js(?:\?[^"'`]*)?)["'`]/g)) {
    try {
      const scriptUrl = new URL(match[1]!, base);
      if (scriptUrl.origin === new URL(base).origin) queue.push(scriptUrl.href);
    } catch {
      continue;
    }
  }
}

function sourcePathsFromPlayerCode(scripts: string[]): string[] {
  const paths = new Set<string>();
  for (const script of scripts) {
    for (const match of script.matchAll(
      /movieUrl\s*:\s*`[^`]*?\/((?:[a-z\d_-]+\/)*[a-z\d_-]+\/movie)`/gi
    )) {
      if (match[1]) paths.add(match[1]);
    }
  }
  return [...paths];
}

async function readPlayerCode(target: string): Promise<string[]> {
  const pageUrl = new URL(target);
  const cacheKey = `${pageUrl.origin}/${pageUrl.pathname.split("/")[1] ?? ""}`;
  const cached = playerCodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.scripts;
  pageUrl.search = "";
  const html = await fetchPlayerText(pageUrl.href, `${pageUrl.origin}/`);
  if (!html) return [];

  const scripts = [html];
  const queue: string[] = [];
  addPlayerScripts(html, pageUrl.href, queue);
  const visited = new Set<string>();
  for (let index = 0; index < queue.length && visited.size < MAX_PLAYER_SCRIPTS; index += 1) {
    const scriptUrl = queue[index]!;
    if (visited.has(scriptUrl)) continue;
    visited.add(scriptUrl);
    const script = await fetchPlayerText(scriptUrl, pageUrl.href);
    if (!script) continue;
    scripts.push(script);
    addPlayerScripts(script, scriptUrl, queue);
  }

  playerCodeCache.set(cacheKey, { scripts, expiresAt: Date.now() + SOURCE_PATH_TTL_MS });
  return scripts;
}

function discoverDecryptionSecret(scripts: string[]): string | null {
  for (const script of scripts) {
    const match = script.match(
      /(?:let|const|var)\s+\w+=["']([A-Za-z\d_-]{20,})["'],\w+=["']https:\/\/new\.vidnest\.fun["']/
    );
    if (match?.[1]) return match[1];
  }
  return null;
}

async function fetchJson(url: string, referer: string): Promise<unknown | null> {
  const started = Date.now();
  const requestUrl = new URL(url);
  requestUrl.searchParams.set("_n", createNonce());
  try {
    const response = await fetchWithRetry(requestUrl.href, {
      Accept: "application/json, text/plain, */*",
      Referer: referer,
      Origin: "https://vidnest.fun",
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
  const playerScripts = await readPlayerCode(target);
  const secret = discoverDecryptionSecret(playerScripts);
  if (!secret) log("could not discover response decryption key from player code");
  const paths =
    request.type === "anime" ? ANIME_SOURCE_PATHS : sourcePathsFromPlayerCode(playerScripts);
  if (request.type !== "anime") {
    if (paths.length)
      log(`discovered ${paths.length} server routes from VidNest player code:`, paths);
    else log("VidNest player code did not expose server routes");
  }
  for (const path of paths) {
    const url = sourceUrl(path, request);
    const payload = await fetchJson(url, referer);
    if (payload === null) continue;
    log("  raw payload:", preview(payload));
    const unwrapped = await unwrap(payload, secret);
    if (unwrapped === null) {
      log("  decrypt failed");
      continue;
    }
    log("  unwrapped:", preview(unwrapped));
    const streams = findStreams(unwrapped, new URL(url).origin);
    for (const stream of streams) {
      log(`  candidate ${stream.mediaType} stream via ${path}:`, stream.url);
      if (await probe(stream)) {
        log(`  FOUND ${stream.mediaType} stream via ${path}`);
        return stream;
      }
      log("  candidate failed media probe; trying next stream");
    }
    if (!streams.length) log("  no stream in payload");
  }
  log("all sources exhausted");
  return null;
}
