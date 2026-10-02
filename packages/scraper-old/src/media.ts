import type { JsonRecord, MediaCandidate, MediaType, SourcesPayload, StreamHeaders } from "./types";

export function isFetchableUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:" || protocol === "s3:";
  } catch {
    return false;
  }
}

export function deriveOriginAndReferer(sourceUrl: string): StreamHeaders {
  try {
    const parsed = new URL(sourceUrl);
    return { Referer: `${parsed.origin}/` };
  } catch {
    return {};
  }
}

export function resolveUrl(relative: string, base: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

export function inheritPlaylistQueryParameters(childUrl: string, parentUrl: string): string {
  try {
    const child = new URL(childUrl);
    const parent = new URL(parentUrl);
    const sameOrigin = child.origin === parent.origin;
    const sharedParameters = new Set([
      "auth",
      "expires",
      "exp",
      "hdnts",
      "sig",
      "signature",
      "token"
    ]);

    for (const [key, value] of parent.searchParams) {
      if (!child.searchParams.has(key) && (sameOrigin || sharedParameters.has(key.toLowerCase()))) {
        child.searchParams.set(key, value);
      }
    }
    return child.href;
  } catch {
    return childUrl;
  }
}

export function getMediaType(url: string, hint?: unknown): MediaType | null {
  if (/mp4-proxy|video-proxy/i.test(url)) {
    try {
      if (!new URL(url).searchParams.has("url")) return null;
    } catch {
      return null;
    }
  }
  if (typeof hint === "string") {
    if (/^(hls|m3u8)$/i.test(hint)) return "hls";
    if (/^(file|mp4|webm|video)$/i.test(hint)) return "file";
    if (/mpegurl|mp4|webm|video\//i.test(hint)) {
      return /mpegurl|m3u8/i.test(hint) ? "hls" : "file";
    }
  }
  if (/\.m3u8(?:[?#]|$)/i.test(url)) return "hls";
  if (/\.mp4(?:[?#]|$)|\.webm(?:[?#]|$)|mp4-proxy|video-proxy/i.test(url)) return "file";
  return null;
}

export function findMediaCandidateInText(text: string, base?: string): MediaCandidate | null {
  const normalized = text
    .replace(/\\u0026/gi, "&")
    .replace(/\\u003d/gi, "=")
    .replace(/\\\//g, "/");
  const urls = normalized.match(/https?:\/\/[^\s"'`<>\\]+/gi) ?? [];

  for (const url of urls) {
    const candidate = resolveMediaCandidate(url, undefined, base);
    if (candidate) return candidate;
  }
  return null;
}

export function sanitizeFilename(value: string | undefined): string {
  const filename = (value || "fishystream-video.mp4").replace(/[\\/"\r\n]/g, "").trim();
  return filename || "fishystream-video.mp4";
}

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStreamHeaders(value: unknown): StreamHeaders {
  if (!isRecord(value)) return {};
  const headers: StreamHeaders = {};

  for (const field of ["preferredHeaders", "headers"]) {
    const source = value[field];
    if (!isRecord(source)) continue;
    for (const [name, entry] of Object.entries(source)) {
      if (typeof entry === "string" && entry) headers[name] = entry;
    }
  }
  return headers;
}

export function resolveMediaCandidate(
  value: unknown,
  hint?: unknown,
  base?: string
): MediaCandidate | null {
  if (typeof value !== "string" || !value.trim()) return null;

  let url = value.trim();
  if (/#EXTM3U|#EXT-X-/i.test(url) || /\r?\n/.test(url)) return null;
  try {
    url = base ? new URL(url, base).href : new URL(url).href;
  } catch {
    return null;
  }

  const captured = unwrapMediaProxy(url, {});
  url = captured.url;
  if (!isFetchableUrl(url)) return null;
  const mediaType = getMediaType(url, hint);
  return mediaType ? { url, mediaType, headers: captured.headers } : null;
}

export function findPlayableMediaInObject(
  value: unknown,
  base?: string,
  inheritedHeaders: StreamHeaders = {}
): MediaCandidate | null {
  if (typeof value === "string") {
    const candidate = resolveMediaCandidate(value, undefined, base);
    return candidate ? { ...candidate, headers: inheritedHeaders } : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findPlayableMediaInObject(item, base, inheritedHeaders);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const headers = { ...inheritedHeaders, ...readStreamHeaders(value) };
  const typeHint = value.type ?? value.format ?? value.mimeType;
  const hasHlsManifest =
    typeof value.manifest === "string" && /#EXTM3U|#EXT-X-/i.test(value.manifest);

  for (const key of ["file", "url", "src", "source", "stream", "hls", "mp4"]) {
    const found = resolveMediaCandidate(
      value[key],
      key === "hls" || (key === "url" && hasHlsManifest)
        ? "hls"
        : key === "mp4"
          ? "file"
          : typeHint,
      base
    );
    if (found) return { ...found, headers: { ...headers, ...found.headers } };
  }

  for (const nested of Object.values(value)) {
    const found = findPlayableMediaInObject(nested, base, headers);
    if (found) return found;
  }
  return null;
}

export function extractSourcesPayload(json: unknown, base?: string): SourcesPayload | null {
  if (!isRecord(json)) return null;
  const candidate = findPlayableMediaInObject(json.sources, base);
  if (!candidate) return null;

  return {
    file: candidate.url,
    mediaType: candidate.mediaType,
    headers: candidate.headers,
    tracks: json.tracks,
    intro: json.intro,
    outro: json.outro
  };
}

export function buildProxyUrl(
  base: string,
  endpoint: string,
  targetUrl: string,
  headers: StreamHeaders
): string {
  return `${base}${endpoint}?url=${encodeURIComponent(targetUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
}

export function getOriginHeaders(url: string): StreamHeaders {
  try {
    const origin = new URL(url).origin;
    return { Origin: origin, Referer: `${origin}/` };
  } catch {
    return {};
  }
}

export function unwrapMediaProxy(url: string, headers: StreamHeaders) {
  try {
    const parsed = new URL(url);
    const nestedUrl = parsed.searchParams.get("url");
    if (!nestedUrl || !/mp4-proxy|video-proxy/i.test(parsed.hostname + parsed.pathname)) {
      return { url, headers };
    }

    let nestedHeaders: StreamHeaders = {};
    const encodedHeaders = parsed.searchParams.get("headers");
    if (encodedHeaders) {
      try {
        nestedHeaders = JSON.parse(encodedHeaders);
      } catch {}
    }
    return { url: nestedUrl, headers: { ...headers, ...nestedHeaders } };
  } catch {
    return { url, headers };
  }
}
