import { browserHeaders, fetchProviderJson } from "./providerResolverBase";
import { isRecord, resolveMediaCandidate } from "../media";
import type { StreamHeaders, StreamResult } from "../types";

const VIDNEST_API = "https://new.vidnest.fun";
const CIPHER_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/=";
const CIPHER_KEY = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";

type VidNestRequest = { id: string; type: "movie" | "tv"; season?: string; episode?: string };

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

function getRequest(targetUrl: string): VidNestRequest | null {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.hostname !== "vidnest.fun") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const type = parts[0];
    const id = parts[1];
    if (!id || (type !== "movie" && type !== "tv")) return null;
    if (type === "movie") return { id, type };
    if (!parts[2] || !parts[3]) return null;
    return { id, type, season: parts[2], episode: parts[3] };
  } catch {
    return null;
  }
}

function decodeBase64(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 4) {
    const quartet = value.slice(index, index + 4).padEnd(4, "=");
    const values = [...quartet].map((character) => CIPHER_ALPHABET.indexOf(character));
    const first = values[0] ?? 64;
    const second = values[1] ?? 64;
    const third = values[2] ?? 64;
    const fourth = values[3] ?? 64;
    bytes.push((first << 2) | (second >> 4));
    if (third !== 64) bytes.push(((second & 15) << 4) | (third >> 2));
    if (fourth !== 64) bytes.push(((third & 3) << 6) | fourth);
  }
  return new Uint8Array(bytes);
}

function decryptCipherText(value: string): unknown {
  const encrypted = decodeBase64(value);
  const state = Array.from({ length: 256 }, (_, index) => index);
  const stateAt = (index: number): number => state[index] ?? 0;
  let offset = 0;
  for (let index = 0; index < 256; index += 1) {
    offset = (offset + stateAt(index) + CIPHER_KEY.charCodeAt(index % CIPHER_KEY.length)) % 256;
    const current = stateAt(index);
    state[index] = stateAt(offset);
    state[offset] = current;
  }
  let index = 0;
  offset = 0;
  const plaintext = encrypted.map((byte) => {
    index = (index + 1) % 256;
    offset = (offset + stateAt(index)) % 256;
    const current = stateAt(index);
    state[index] = stateAt(offset);
    state[offset] = current;
    return byte ^ stateAt((stateAt(index) + stateAt(offset)) % 256);
  });
  return JSON.parse(new TextDecoder().decode(new Uint8Array(plaintext)));
}

function decodePayload(value: unknown): unknown {
  if (!isRecord(value) || value.encrypted !== true) return value;
  return typeof value.data === "string" ? decryptCipherText(value.data) : null;
}

function getStream(value: unknown, origin: string): StreamResult | null {
  if (!isRecord(value) || typeof value.url !== "string") return null;
  const candidate = resolveMediaCandidate(value.url, value.type, origin);
  if (!candidate) return null;
  const headers: StreamHeaders = {};
  if (isRecord(value.headers)) {
    for (const [name, header] of Object.entries(value.headers)) {
      if (typeof header === "string") headers[name] = header;
    }
  }
  return { ...candidate, headers, tracks: value.tracks };
}

function findStream(value: unknown, origin: string): StreamResult | null {
  if (!isRecord(value)) return null;
  const direct = getStream(value, origin);
  if (direct) return direct;
  const nested = isRecord(value.data) ? getStream(value.data.stream, origin) : null;
  if (nested) return nested;
  for (const key of ["sources", "streams"]) {
    if (!Array.isArray(value[key])) continue;
    for (const source of value[key]) {
      const stream = getStream(source, origin);
      if (stream) return stream;
    }
  }
  return null;
}

function getSourceUrl(sourcePath: string, request: VidNestRequest): URL {
  const path =
    request.type === "movie"
      ? `${sourcePath}/${request.id}`
      : sourcePath.replace(/\/movie$/, "/tv") +
        `/${request.id}/${request.season}/${request.episode}`;
  return new URL(`/${path}`, VIDNEST_API);
}

export async function resolveVidNest(targetUrl: string): Promise<StreamResult | null> {
  const request = getRequest(targetUrl);
  if (!request) return null;
  for (const sourcePath of SOURCE_PATHS) {
    const sourceUrl = getSourceUrl(sourcePath, request);
    const value = await fetchProviderJson(sourceUrl.href, {
      ...browserHeaders,
      Referer: `${new URL(targetUrl).origin}/`
    });
    const stream = findStream(decodePayload(value), sourceUrl.origin);
    if (stream) return stream;
  }
  return null;
}
