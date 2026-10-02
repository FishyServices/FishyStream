import { browserHeaders } from "./providerResolverBase";
import { getMediaType, isFetchableUrl, resolveMediaCandidate } from "../media";
import type { StreamHeaders, StreamResult } from "../types";

function getRequest(targetUrl: string) {
  try {
    const parsed = new URL(targetUrl);
    const match = parsed.pathname.match(/\/embed\/(movie|tv)\/([^/]+)/i);
    const type = match?.[1]?.toLowerCase();
    const id = match?.[2];
    if (!id || (type !== "movie" && type !== "tv")) return null;
    if (type === "movie") return { id, type: "movie" as const };
    const parts = parsed.pathname.split("/").filter(Boolean);
    return { id, type: "tv" as const, season: parts[3], episode: parts[4] };
  } catch {
    return null;
  }
}

function extractToken(html: string): string | null {
  return (
    html.match(/requestToken\\":\\"([^\\"]+)/i)?.[1] ??
    html.match(/requestToken\s*[:=]\s*["']([^"']+)["']/i)?.[1] ??
    null
  );
}

function extractScriptUrls(html: string, origin: string): string[] {
  return [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].flatMap((match) => {
    const source = match[1];
    if (!source) return [];
    try {
      return [new URL(source, origin).href];
    } catch {
      return [];
    }
  });
}

function extractProviderIds(script: string): string[] {
  const providerArrays = [...script.matchAll(/=\[((?:"[a-z0-9_-]+"\s*,?){3,})\]/gi)];
  return providerArrays.flatMap((match) => {
    const valuesText = match[1];
    if (!valuesText) return [];
    try {
      const values = JSON.parse(`[${valuesText.replace(/,\s*$/, "")}]`);
      return Array.isArray(values) && values.every((value) => typeof value === "string")
        ? values
        : [];
    } catch {
      return [];
    }
  });
}

async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverProviderIds(
  html: string,
  origin: string,
  referrer: string
): Promise<string[]> {
  const scriptUrls = extractScriptUrls(html, origin);
  const scripts = await Promise.all(
    scriptUrls.map(async (url) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(url, {
          headers: { ...browserHeaders, Referer: referrer, Origin: origin },
          signal: controller.signal
        });
        return response.ok ? await response.text() : "";
      } catch {
        return "";
      } finally {
        clearTimeout(timeout);
      }
    })
  );
  return [...new Set(scripts.flatMap(extractProviderIds))];
}

function unwrapDownloadUrl(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.pathname === "/api/download" ? (parsed.searchParams.get("url") ?? value) : value;
  } catch {
    return value;
  }
}

async function decryptPayload(value: string): Promise<unknown> {
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
  const request = getRequest(targetUrl);
  if (!request) return null;

  try {
    const pageResponse = await fetchWithTimeout(
      targetUrl,
      {
        headers: { ...browserHeaders, Referer: "https://vidlux.xyz/" }
      },
      10000
    );
    if (!pageResponse.ok) return null;
    const pageHtml = await pageResponse.text();
    const token = extractToken(pageHtml);
    if (!token) return null;

    const targetOrigin = new URL(targetUrl).origin;
    const providerIds = await discoverProviderIds(pageHtml, targetOrigin, targetUrl);
    if (providerIds.length === 0) return null;
    const results = await Promise.all(
      providerIds.map(async (provider): Promise<StreamResult | null> => {
        try {
          const endpoint = new URL(`/api/extract/${provider}`, targetOrigin);
          endpoint.searchParams.set("id", request.id);
          endpoint.searchParams.set("type", request.type);
          endpoint.searchParams.set("_t", token);
          if (request.type === "tv" && request.season && request.episode) {
            endpoint.searchParams.set("season", request.season);
            endpoint.searchParams.set("episode", request.episode);
          }

          const response = await fetchWithTimeout(
            endpoint,
            {
              headers: { ...browserHeaders, Origin: targetOrigin, Referer: targetUrl }
            },
            10000
          );
          if (!response.ok) return null;
          const payload = (await response.json()) as {
            encrypted?: boolean;
            data?: string;
            streams?: unknown;
            captions?: unknown;
          };
          const decoded =
            payload.encrypted && payload.data ? await decryptPayload(payload.data) : payload;
          if (!decoded || typeof decoded !== "object") return null;
          const streams = (decoded as { streams?: unknown }).streams;
          if (!Array.isArray(streams)) return null;

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
        } catch {
          return null;
        }
        return null;
      })
    );
    return results.find((result): result is StreamResult => result !== null) ?? null;
  } catch (error) {
    console.warn("[VidLux] Dedicated resolver failed", error);
    return null;
  }
}
