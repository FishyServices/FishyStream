import { INSECURE_TLS } from "../../fetcher";
import { isHttpUrl, originHeaders, resolveMedia } from "../../media";
import type { Stream, StreamHeaders } from "../../../types";

const PLAYER_ORIGIN = "https://player.vidzee.wtf";
const CORE_ORIGIN = "https://core.vidzee.wtf";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const API_KEY_SEED = "4f2a9c7d1e8b3a6f0d5c2e9a7b1f4d8c";
const USER_AGENT =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.7051.98 Safari/537.36";
const TIMEOUT_MS = 6_000;
const SERVER_IDS = Array.from({ length: 14 }, (_, index) => index);
const API_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: PLAYER_ORIGIN,
  Referer: `${PLAYER_ORIGIN}/`
};

type Request =
  { id: string; type: "movie" } | { id: string; type: "tv"; season: string; episode: string };

type Link = { link: string; type?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.hostname !== "player.vidzee.wtf") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[2];
    if (parts[0] !== "embed" || !id || !/^(?:\d{1,10}|tt\d{5,10})$/i.test(id)) return null;
    if (parts[1] === "movie" && parts.length === 3) return { id, type: "movie" };
    if (parts[1] !== "tv" || parts.length !== 5) return null;
    const season = parts[3];
    const episode = parts[4];
    if (!season || !episode || !/^\d{1,4}$/.test(season) || !/^\d{1,4}$/.test(episode)) return null;
    if (Number(episode) < 1) return null;
    return { id, type: "tv", season: String(Number(season)), episode: String(Number(episode)) };
  } catch {
    return null;
  }
}

async function fetchText(url: string, headers: StreamHeaders): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers, signal: controller.signal, ...INSECURE_TLS });
    const text = await response.text();
    return response.ok ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, headers: StreamHeaders): Promise<unknown | null> {
  const text = await fetchText(url, headers);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function resolveTmdbId(id: string, type: "movie" | "tv"): Promise<string | null> {
  if (!/^tt\d+$/i.test(id)) return id;
  const url = `${TMDB_API}/find/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
  const value = await fetchJson(url, { "User-Agent": USER_AGENT, Accept: "application/json" });
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
    sealed.set(ciphertext);
    sealed.set(tag, ciphertext.length);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(API_KEY_SEED));
    const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
      "decrypt"
    ]);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed);
    return new TextDecoder().decode(plaintext) || null;
  } catch {
    return null;
  }
}

async function decryptLink(value: string, linkKey: string): Promise<string | null> {
  try {
    const parts = atob(value.trim()).split(":");
    const ivPart = parts[0];
    const cipherPart = parts[1];
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

async function fetchLinkKey(): Promise<string | null> {
  const blob = await fetchText(`${CORE_ORIGIN}/api-key`, API_HEADERS);
  return blob ? deriveLinkKey(blob) : null;
}

function readLinks(value: unknown): Link[] {
  if (!isRecord(value) || !Array.isArray(value.url)) return [];
  return value.url.flatMap((entry): Link[] =>
    isRecord(entry) && typeof entry.link === "string" && entry.link
      ? [{ link: entry.link, ...(typeof entry.type === "string" ? { type: entry.type } : {}) }]
      : []
  );
}

function getStreamHeaders(url: string): StreamHeaders {
  const hostname = new URL(url).hostname;
  if (hostname.endsWith("fast33lane")) {
    return { Referer: "https://rapidairmax.site/", Origin: "https://rapidairmax.site" };
  }
  if (hostname === "serversicuro.cc" || hostname.endsWith(".serversicuro.cc")) return {};
  return { "User-Agent": USER_AGENT, Origin: PLAYER_ORIGIN, Referer: `${CORE_ORIGIN}/` };
}

async function probe(stream: Stream, headers: StreamHeaders): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(stream.url, {
      headers: {
        "User-Agent": USER_AGENT,
        ...(Object.keys(headers).length ? headers : originHeaders(stream.url)),
        ...(stream.mediaType === "file" ? { Range: "bytes=0-1023" } : {})
      },
      signal: controller.signal,
      ...INSECURE_TLS
    });
    if (stream.mediaType === "hls") {
      const text = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      return response.ok && text.startsWith("#EXTM3U");
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    return (
      (response.status === 200 || response.status === 206) &&
      !/text\/|html|json|xml/.test(contentType)
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readTracks(value: unknown): unknown[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.tracks)) return undefined;
  const seen = new Set<string>();
  const tracks = value.tracks.flatMap((track) => {
    if (!isRecord(track) || typeof track.url !== "string" || typeof track.lang !== "string")
      return [];
    try {
      const file = new URL(track.url, PLAYER_ORIGIN).href;
      if (!isHttpUrl(file) || seen.has(file)) return [];
      seen.add(file);
      return [{ label: track.lang.replace(/\d+/g, "").trim() || track.lang, file, type: "vtt" }];
    } catch {
      return [];
    }
  });
  return tracks.length ? tracks : undefined;
}

async function resolveServer(
  request: Request,
  tmdbId: string,
  serverId: number,
  linkKey: string
): Promise<Stream | null> {
  try {
    const url = new URL("/api/server", PLAYER_ORIGIN);
    url.searchParams.set("id", tmdbId);
    url.searchParams.set("sr", String(serverId));
    if (request.type === "tv") {
      url.searchParams.set("ss", request.season);
      url.searchParams.set("ep", request.episode);
    }
    const payload = await fetchJson(url.href, API_HEADERS);
    if (!isRecord(payload)) return null;
    for (const link of readLinks(payload).slice(0, 3)) {
      const decrypted = await decryptLink(link.link, linkKey);
      if (!decrypted || /\/demo-video\.mp4(?:[?#]|$)/i.test(decrypted)) continue;
      const stream = resolveMedia(decrypted, PLAYER_ORIGIN, link.type);
      if (!stream) continue;
      const headers = getStreamHeaders(stream.url);
      if (await probe(stream, headers)) {
        const tracks = readTracks(payload);
        return { ...stream, headers, ...(tracks ? { tracks } : {}) };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function resolveVidZee(target: string): Promise<Stream | null> {
  const request = getRequest(target);
  if (!request) return null;
  try {
    const tmdbId = await resolveTmdbId(request.id, request.type);
    if (!tmdbId) return null;
    const linkKey = await fetchLinkKey();
    if (!linkKey) return null;
    const attempts = SERVER_IDS.map((serverId) =>
      resolveServer(request, tmdbId, serverId, linkKey)
    );
    for (const attempt of attempts) {
      const stream = await attempt;
      if (stream) return stream;
    }
  } catch {
    return null;
  }
  return null;
}
