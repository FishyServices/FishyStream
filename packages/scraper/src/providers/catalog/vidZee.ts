// DOES NOT WORK

import { INSECURE_TLS } from "../fetcher";
import { isHttpUrl, resolveMedia } from "../media";
import type { MediaType, Stream, StreamHeaders } from "../../types";

const PLAYER = "https://player.vidzee.wtf";
const CORE = "https://core.vidzee.wtf";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const API_KEY_SEED = "4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c";
const USER_AGENT =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7051.98 Safari/537.36";
const TIMEOUT_MS = 6000;
const MAX_LINKS_PER_SERVER = 3;
const SERVER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

const API_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: PLAYER,
  Referer: PLAYER
};

type Request =
  { id: string; type: "movie" } | { id: string; type: "tv"; season: string; episode: string };
type ServerLink = { link: string; type?: string };

const log = (...args: unknown[]) => console.log("[vidzee]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 300);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNumber(value: string | undefined, minimum: number): string | null {
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= minimum ? String(parsed) : null;
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.hostname !== "player.vidzee.wtf") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const type = parts[1];
    const id = parts[2];
    if (parts[0] !== "embed" || !id || !/^(?:\d{1,10}|tt\d{5,10})$/i.test(id)) return null;
    if (type === "movie") return { id, type };
    if (type !== "tv") return null;
    const season = normalizeNumber(parts[3], 0);
    const episode = normalizeNumber(parts[4], 1);
    return season && episode ? { id, type, season, episode } : null;
  } catch {
    return null;
  }
}

async function fetchRaw(
  url: string,
  headers: StreamHeaders,
  label: string
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: controller.signal, ...INSECURE_TLS });
    log(`${label} -> ${response.status} (${Date.now() - started}ms)`);
    return response;
  } catch (error) {
    log(`${label} threw after ${Date.now() - started}ms:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(
  url: string,
  headers: StreamHeaders,
  label: string
): Promise<unknown | null> {
  const response = await fetchRaw(url, headers, label);
  if (!response) return null;
  if (!response.ok) {
    log("  body:", preview(await response.text().catch(() => "")));
    return null;
  }
  try {
    return await response.json();
  } catch {
    log("  response was not JSON");
    return null;
  }
}

async function resolveTmdbId(id: string, type: "movie" | "tv"): Promise<string | null> {
  if (!/^tt\d+$/i.test(id)) return id;
  const value = await fetchJson(
    `${TMDB_API}/find/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
    { Accept: "application/json", "User-Agent": USER_AGENT },
    "tmdb find"
  );
  if (!isRecord(value)) return null;
  const results = value[type === "movie" ? "movie_results" : "tv_results"];
  if (!Array.isArray(results)) return null;
  const match = results.find((entry) => isRecord(entry) && typeof entry.id === "number");
  return isRecord(match) && typeof match.id === "number" ? String(match.id) : null;
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value.replace(/\s+/g, ""));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function deriveLinkKey(blob: string): Promise<string | null> {
  try {
    const bytes = base64ToBytes(blob);
    if (!bytes || bytes.length <= 28) {
      log("  api-key blob too short / not base64:", preview(blob));
      return null;
    }
    const iv = bytes.slice(0, 12);
    const tag = bytes.slice(12, 28);
    const ciphertext = bytes.slice(28);
    const sealed = new Uint8Array(ciphertext.length + tag.length);
    sealed.set(ciphertext, 0);
    sealed.set(tag, ciphertext.length);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(API_KEY_SEED));
    const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
      "decrypt"
    ]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      sealed
    );
    return new TextDecoder().decode(plaintext) || null;
  } catch (error) {
    log("  api-key decrypt failed (seed may have changed):", error);
    return null;
  }
}

async function decryptLink(value: string, linkKey: string): Promise<string | null> {
  try {
    const [ivPart, cipherPart] = atob(value.trim()).split(":");
    if (!ivPart || !cipherPart) return null;
    const iv = base64ToBytes(ivPart);
    const ciphertext = base64ToBytes(cipherPart);
    if (!iv || !ciphertext) return null;
    const keyBytes = new Uint8Array(32);
    keyBytes.set(new TextEncoder().encode(linkKey).slice(0, 32));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, [
      "decrypt"
    ]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, ciphertext);
    return new TextDecoder().decode(plaintext) || null;
  } catch (error) {
    log("  link decrypt failed:", error);
    return null;
  }
}

async function fetchLinkKey(): Promise<string | null> {
  const response = await fetchRaw(`${CORE}/api-key`, API_HEADERS, "api-key");
  if (!response) return null;
  const blob = await response.text().catch(() => "");
  if (response.status !== 200) {
    log("  body:", preview(blob));
    return null;
  }
  return deriveLinkKey(blob);
}

function readLinks(payload: unknown): ServerLink[] {
  if (!isRecord(payload) || !Array.isArray(payload.url)) return [];
  return payload.url.flatMap((entry): ServerLink[] => {
    if (!isRecord(entry) || typeof entry.link !== "string" || !entry.link) return [];
    return [{ link: entry.link, type: typeof entry.type === "string" ? entry.type : undefined }];
  });
}

function readTracks(payload: unknown): unknown[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.tracks)) return undefined;
  const seen = new Set<string>();
  const tracks = payload.tracks.flatMap((track) => {
    if (!isRecord(track) || typeof track.url !== "string" || typeof track.lang !== "string")
      return [];
    try {
      const file = new URL(track.url, PLAYER).href;
      if (!isHttpUrl(file) || seen.has(file)) return [];
      seen.add(file);
      return [{ label: track.lang.replace(/\d+/g, "").trim() || track.lang, file, type: "vtt" }];
    } catch {
      return [];
    }
  });
  return tracks.length > 0 ? tracks : undefined;
}

function streamHeaders(url: string): StreamHeaders {
  const host = new URL(url).hostname;
  if (host.includes("fast33lane"))
    return { Referer: "https://rapidairmax.site/", Origin: "https://rapidairmax.site" };
  if (host === "serversicuro.cc" || host.endsWith(".serversicuro.cc")) return {};
  return { "User-Agent": USER_AGENT, Origin: PLAYER, Referer: `${CORE}/` };
}

async function isPlayable(
  url: string,
  mediaType: MediaType,
  headers: StreamHeaders
): Promise<boolean> {
  const requestHeaders: StreamHeaders = { "User-Agent": USER_AGENT, ...headers };
  if (mediaType === "file") requestHeaders.Range = "bytes=0-1023";
  const response = await fetchRaw(url, requestHeaders, "  probe");
  if (!response) return true;
  if (!response.ok) {
    log("  probe rejected:", preview(await response.text().catch(() => "")));
    return false;
  }
  if (mediaType === "hls") {
    const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
    if (!body.startsWith("#EXTM3U")) log("  probe not an m3u8:", preview(body));
    return body.startsWith("#EXTM3U");
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  await response.body?.cancel().catch(() => undefined);
  return !/text\/|html|json|xml/.test(contentType);
}

async function resolveLink(
  link: ServerLink,
  linkKey: string
): Promise<{ stream: Stream; headers: StreamHeaders } | null> {
  const decrypted = await decryptLink(link.link, linkKey);
  if (!decrypted) return null;
  log("  decrypted link:", preview(decrypted));
  if (/\/demo-video\.mp4(?:[?#]|$)/i.test(decrypted)) return null;
  const stream = resolveMedia(decrypted, PLAYER, link.type);
  if (!stream) {
    log("  not a recognised media url");
    return null;
  }
  const headers = streamHeaders(stream.url);
  return (await isPlayable(stream.url, stream.mediaType, headers)) ? { stream, headers } : null;
}

async function resolveServer(
  request: Request,
  tmdbId: string,
  serverId: number,
  linkKey: string
): Promise<Stream | null> {
  try {
    const url = new URL("/api/server", PLAYER);
    url.searchParams.set("id", tmdbId);
    url.searchParams.set("sr", String(serverId));
    if (request.type === "tv") {
      url.searchParams.set("ss", request.season);
      url.searchParams.set("ep", request.episode);
    }
    const payload = await fetchJson(url.href, API_HEADERS, `server ${serverId}`);
    const links = readLinks(payload).slice(0, MAX_LINKS_PER_SERVER);
    if (links.length === 0 && payload) log(`  server ${serverId}: no links in`, preview(payload));
    for (const link of links) {
      const resolved = await resolveLink(link, linkKey);
      if (!resolved) continue;
      const tracks = readTracks(payload);
      return { ...resolved.stream, headers: resolved.headers, ...(tracks ? { tracks } : {}) };
    }
  } catch (error) {
    log(`server ${serverId} threw:`, error);
  }
  return null;
}

export async function resolveVidZee(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse request from", target);
    return null;
  }
  log("request:", JSON.stringify(request));

  const tmdbId = await resolveTmdbId(request.id, request.type);
  if (!tmdbId) {
    log("could not resolve TMDB id");
    return null;
  }
  const linkKey = await fetchLinkKey();
  if (!linkKey) {
    log("could not get link key");
    return null;
  }
  log("got link key");

  const attempts = SERVER_IDS.map((serverId) => resolveServer(request, tmdbId, serverId, linkKey));
  for (const attempt of attempts) {
    const stream = await attempt;
    if (stream) {
      log(`FOUND ${stream.mediaType} stream:`, stream.url);
      return stream;
    }
  }
  log("all servers exhausted");
  return null;
}
