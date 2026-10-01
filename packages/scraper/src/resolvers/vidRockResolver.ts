import { browserHeaders, fetchProviderJson } from "./providerResolverBase";
import { isRecord, resolveMediaCandidate } from "../media";
import type { StreamResult } from "../types";

const VIDROCK_API = "https://vidrock.net/api";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const VIDROCK_KEY = "7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f";

type VidRockRequest = {
  apiUrl: string;
  origin: string;
};

async function resolveTmdbId(id: string, type: "movie" | "tv"): Promise<string | null> {
  if (!/^tt\d+$/i.test(id)) return id;
  const value = await fetchProviderJson(
    `${TMDB_API}/find/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
    browserHeaders
  );
  if (!isRecord(value)) return null;
  const results = value[type === "movie" ? "movie_results" : "tv_results"];
  if (!Array.isArray(results)) return null;
  const match = results.find((entry) => isRecord(entry) && typeof entry.id === "number");
  return match && isRecord(match) && typeof match.id === "number" ? String(match.id) : null;
}

function getRequest(targetUrl: string): VidRockRequest | null {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.hostname !== "vidrock.ru" && parsed.hostname !== "vidrock.to") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] !== "embed" || !parts[1] || !parts[2]) return null;
    const type = parts[1];
    const id = parts[2];
    if (type === "movie") {
      return { apiUrl: `${VIDROCK_API}/movie/${encodeURIComponent(id)}`, origin: parsed.origin };
    }
    if (type !== "tv" || !parts[3] || !parts[4]) return null;
    return {
      apiUrl: `${VIDROCK_API}/tv/${encodeURIComponent(id)}/${encodeURIComponent(parts[3])}/${encodeURIComponent(parts[4])}`,
      origin: parsed.origin
    };
  } catch {
    return null;
  }
}

function decodeHex(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return new Uint8Array();
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function decodeBase64Url(value: string): Uint8Array {
  try {
    const normalized = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(normalized);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

async function decryptSource(value: string): Promise<string | null> {
  const encrypted = decodeBase64Url(value);
  if (encrypted.length < 28) return null;
  try {
    const keyBytes = decodeHex(VIDROCK_KEY);
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
      "decrypt"
    ]);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.slice(0, 12) },
      key,
      encrypted.slice(12)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    return null;
  }
}

async function resolveSource(value: unknown, origin: string): Promise<StreamResult | null> {
  if (!isRecord(value) || typeof value.url !== "string") return null;
  const url = await decryptSource(value.url);
  if (!url) return null;
  if (/\/demo-video\.mp4(?:[?#]|$)/i.test(url)) return null;
  const candidate = resolveMediaCandidate(url, value.type, origin);
  return candidate ? { ...candidate, headers: { Referer: `${origin}/` } } : null;
}

export async function resolveVidRock(targetUrl: string): Promise<StreamResult | null> {
  const parsed = new URL(targetUrl);
  const parts = parsed.pathname.split("/").filter(Boolean);
  const type = parts[1] === "movie" || parts[1] === "tv" ? parts[1] : null;
  const tmdbId = type && parts[2] ? await resolveTmdbId(parts[2], type) : null;
  if (!tmdbId) return null;
  const normalizedUrl =
    type === "movie"
      ? `${parsed.origin}/embed/movie/${tmdbId}`
      : `${parsed.origin}/embed/tv/${tmdbId}/${parts[3]}/${parts[4]}`;
  const request = getRequest(normalizedUrl);
  if (!request) return null;
  const payload = await fetchProviderJson(request.apiUrl, {
    ...browserHeaders,
    Referer: `${request.origin}/`
  });
  if (!isRecord(payload)) return null;
  for (const source of Object.values(payload)) {
    const result = await resolveSource(source, request.origin);
    if (result) return result;
  }
  return null;
}
