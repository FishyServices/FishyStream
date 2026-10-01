import { isFetchableUrl, isRecord, resolveMediaCandidate } from "../media";
import type { StreamHeaders, StreamResult } from "../types";
import { fetchProviderWithReferrerFallback } from "./httpFetcher";

export const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*"
};

export async function fetchProviderJson(
  url: string,
  headers: StreamHeaders
): Promise<unknown | null> {
  try {
    const response = await fetchProviderWithReferrerFallback(url, headers);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export function resolveProviderStream(
  source: unknown,
  origin: string,
  hint?: unknown,
  headers: StreamHeaders = { Referer: `${origin}/` }
): StreamResult | null {
  if (!isRecord(source) || typeof source.url !== "string") return null;
  const candidate = resolveMediaCandidate(source.url, hint ?? source.type, origin);
  return candidate ? { ...candidate, headers } : null;
}

export function resolveSubtitleTracks(value: unknown, origin: string): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((track) => {
    if (!isRecord(track) || typeof track.file !== "string") return [];
    try {
      const file = new URL(track.file, origin).href;
      return isFetchableUrl(file) ? [{ ...track, file }] : [];
    } catch {
      return [];
    }
  });
}
