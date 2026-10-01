import { getOriginHeaders, isFetchableUrl, isRecord, resolveMediaCandidate } from "../media";
import type { MediaCandidate, StreamHeaders, StreamResult } from "../types";

const VIDZEE_PLAYER = "https://player.vidzee.wtf";
const VIDZEE_CORE = "https://core.vidzee.wtf";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const API_KEY_SEED = "4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c";
const USER_AGENT =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7051.98 Safari/537.36";
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_LINKS_PER_SERVER = 3;

const VIDZEE_SERVER_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

const apiHeaders: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: VIDZEE_PLAYER,
  Referer: VIDZEE_PLAYER
};

type VidZeeRequest =
  { id: string; type: "movie" } | { id: string; type: "tv"; season: string; episode: string };

type ServerLink = { link: string; type?: string };

export type VidZeeOptions = { timeoutMs?: number };

function normalizeNumber(value: string | undefined, minimum: number): string | null {
  if (!value || !/^\d{1,4}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed >= minimum ? String(parsed) : null;
}

function getRequest(targetUrl: string): VidZeeRequest | null {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.hostname !== "player.vidzee.wtf") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
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

async function fetchJson(url: string, headers: StreamHeaders, timeoutMs: number): Promise<unknown> {
  try {
    return await fetchWithTimeout(
      url,
      { headers: cleanHeaders(headers) },
      timeoutMs,
      async (response) => (response.ok ? ((await response.json()) as unknown) : null)
    );
  } catch {
    return null;
  }
}

function cleanHeaders(headers: StreamHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string" && value) result[name] = value;
  }
  return result;
}

async function resolveTmdbId(
  id: string,
  type: "movie" | "tv",
  timeoutMs: number
): Promise<string | null> {
  if (!/^tt\d+$/i.test(id)) return id;
  const value = await fetchJson(
    `${TMDB_API}/find/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
    { Accept: "application/json", "User-Agent": USER_AGENT },
    timeoutMs
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
    if (!bytes || bytes.length <= 28) return null;
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
  } catch {
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
  } catch {
    return null;
  }
}

async function fetchLinkKey(timeoutMs: number): Promise<string | null> {
  try {
    const blob = await fetchWithTimeout(
      `${VIDZEE_CORE}/api-key`,
      { headers: cleanHeaders(apiHeaders) },
      timeoutMs,
      async (response) => (response.status === 200 ? await response.text() : null)
    );
    return blob ? await deriveLinkKey(blob) : null;
  } catch {
    return null;
  }
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
    if (!isRecord(track) || typeof track.url !== "string" || typeof track.lang !== "string") {
      return [];
    }
    try {
      const file = new URL(track.url, VIDZEE_PLAYER).href;
      if (!isFetchableUrl(file) || seen.has(file)) return [];
      seen.add(file);
      return [{ label: track.lang.replace(/\d+/g, "").trim() || track.lang, file, type: "vtt" }];
    } catch {
      return [];
    }
  });
  return tracks.length > 0 ? tracks : undefined;
}

function getStreamHeaders(url: string): StreamHeaders {
  const host = new URL(url).hostname;
  if (host.includes("fast33lane")) {
    return { Referer: "https://rapidairmax.site/", Origin: "https://rapidairmax.site" };
  }
  if (host === "serversicuro.cc" || host.endsWith(".serversicuro.cc")) return {};
  return { "User-Agent": USER_AGENT, Origin: VIDZEE_PLAYER, Referer: `${VIDZEE_CORE}/` };
}

async function isPlayableMedia(
  candidate: MediaCandidate,
  headers: StreamHeaders,
  timeoutMs: number
): Promise<boolean> {
  try {
    const requestHeaders = cleanHeaders({
      "User-Agent": USER_AGENT,
      ...(Object.keys(headers).length > 0 ? headers : getOriginHeaders(candidate.url)),
      ...(candidate.mediaType === "file" ? { Range: "bytes=0-1023" } : {})
    });
    return await fetchWithTimeout(
      candidate.url,
      { headers: requestHeaders },
      timeoutMs,
      async (response) => {
        if (!response.ok) return false;
        if (candidate.mediaType === "hls") {
          const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
          return body.startsWith("#EXTM3U");
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

async function resolveLink(
  link: ServerLink,
  linkKey: string,
  timeoutMs: number
): Promise<{ candidate: MediaCandidate; headers: StreamHeaders } | null> {
  const decrypted = await decryptLink(link.link, linkKey);
  if (!decrypted) return null;
  if (/\/demo-video\.mp4(?:[?#]|$)/i.test(decrypted)) return null;
  const candidate = resolveMediaCandidate(decrypted, link.type, VIDZEE_PLAYER);
  if (!candidate) return null;
  const headers = { ...getStreamHeaders(candidate.url), ...candidate.headers };
  return (await isPlayableMedia(candidate, headers, timeoutMs)) ? { candidate, headers } : null;
}

async function resolveServer(
  request: VidZeeRequest,
  tmdbId: string,
  serverId: number,
  linkKey: string,
  timeoutMs: number
): Promise<StreamResult | null> {
  try {
    const url = new URL("/api/server", VIDZEE_PLAYER);
    url.searchParams.set("id", tmdbId);
    url.searchParams.set("sr", String(serverId));
    if (request.type === "tv") {
      url.searchParams.set("ss", request.season);
      url.searchParams.set("ep", request.episode);
    }
    const payload = await fetchJson(url.href, apiHeaders, timeoutMs);
    const links = readLinks(payload).slice(0, MAX_LINKS_PER_SERVER);
    for (const link of links) {
      const resolved = await resolveLink(link, linkKey, timeoutMs);
      if (!resolved) continue;
      const tracks = readTracks(payload);
      return {
        url: resolved.candidate.url,
        mediaType: resolved.candidate.mediaType,
        headers: resolved.headers,
        ...(tracks ? { tracks } : {})
      };
    }
  } catch {}
  return null;
}

export async function resolveVidZee(
  targetUrl: string,
  options: VidZeeOptions = {}
): Promise<StreamResult | null> {
  const request = getRequest(targetUrl);
  if (!request) return null;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const tmdbId = await resolveTmdbId(request.id, request.type, timeoutMs);
    if (!tmdbId) return null;
    const linkKey = await fetchLinkKey(timeoutMs);
    if (!linkKey) return null;

    const attempts = VIDZEE_SERVER_IDS.map((serverId) =>
      resolveServer(request, tmdbId, serverId, linkKey, timeoutMs)
    );
    for (const attempt of attempts) {
      const stream = await attempt;
      if (stream) return stream;
    }
    return null;
  } catch (error) {
    console.warn("[VidZee] Dedicated resolver failed", error);
    return null;
  }
}
