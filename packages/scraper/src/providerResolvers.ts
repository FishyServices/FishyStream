import { getMediaType, isFetchableUrl, resolveMediaCandidate } from "./media";
import type { StreamHeaders, StreamResult } from "./types";

const browserHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*"
};

function getVidLuxRequest(targetUrl: string): {
  id: string;
  type: "movie" | "tv";
  season?: string;
  episode?: string;
} | null {
  try {
    const parsed = new URL(targetUrl);
    const match = parsed.pathname.match(/\/embed\/(movie|tv)\/([^/]+)/i);
    const kind = match?.[1];
    const id = match?.[2];
    if (!kind || !id) return null;
    if (kind.toLowerCase() === "movie") return { id, type: "movie" };

    const parts = parsed.pathname.split("/").filter(Boolean);
    return { id, type: "tv", season: parts[3], episode: parts[4] };
  } catch {
    return null;
  }
}

function extractRequestToken(html: string): string | null {
  const escaped = html.match(/requestToken\\":\\"([^\\"]+)/i);
  if (escaped?.[1]) return escaped[1];
  const plain = html.match(/requestToken\s*[:=]\s*["']([^"']+)["']/i);
  return plain?.[1] ?? null;
}

function unwrapDownloadUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.pathname === "/api/download") {
      return parsed.searchParams.get("url") ?? value;
    }
  } catch {}
  return value;
}

async function decryptVidLuxPayload(value: string): Promise<unknown> {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("vidlux-stream-encryption-2026-secure-key")
  );
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export async function resolveVidLux(targetUrl: string): Promise<StreamResult | null> {
  const request = getVidLuxRequest(targetUrl);
  if (!request) return null;

  try {
    const pageResponse = await fetch(targetUrl, {
      headers: { ...browserHeaders, Referer: "https://vidlux.xyz/" }
    });
    if (!pageResponse.ok) return null;
    const token = extractRequestToken(await pageResponse.text());
    if (!token) return null;

    for (const provider of ["bolt", "vidstuck"]) {
      const endpoint = new URL(`/api/extract/${provider}`, new URL(targetUrl).origin);
      endpoint.searchParams.set("id", request.id);
      endpoint.searchParams.set("type", request.type);
      endpoint.searchParams.set("_t", token);
      if (request.type === "tv" && request.season && request.episode) {
        endpoint.searchParams.set("season", request.season);
        endpoint.searchParams.set("episode", request.episode);
      }

      const response = await fetch(endpoint, {
        headers: { ...browserHeaders, Origin: new URL(targetUrl).origin, Referer: targetUrl }
      });
      if (!response.ok) continue;

      const payload = (await response.json()) as {
        encrypted?: boolean;
        data?: string;
        streams?: unknown;
        captions?: unknown;
      };
      const decoded =
        payload.encrypted && payload.data ? await decryptVidLuxPayload(payload.data) : payload;
      if (!decoded || typeof decoded !== "object") continue;

      const streams = (decoded as { streams?: unknown }).streams;
      if (!Array.isArray(streams)) continue;
      for (const stream of streams) {
        if (!stream || typeof stream !== "object") continue;
        const value = stream as { file?: unknown; type?: unknown };
        if (typeof value.file !== "string") continue;
        const fileUrl = unwrapDownloadUrl(value.file);
        if (!isFetchableUrl(fileUrl)) continue;
        const mediaType =
          getMediaType(fileUrl, value.type) ??
          resolveMediaCandidate(fileUrl, value.type)?.mediaType;
        if (!mediaType) continue;
        const headers: StreamHeaders = { Referer: "https://vidlux.xyz/" };
        return {
          url: fileUrl,
          mediaType,
          headers,
          tracks: (decoded as { captions?: unknown }).captions
        };
      }
    }
  } catch (error) {
    console.warn("[VidLux] Dedicated resolver failed", error);
  }
  return null;
}
