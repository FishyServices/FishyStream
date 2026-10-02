import type { MediaType, Stream, StreamHeaders } from "../types";

export function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function mediaTypeFor(url: string, hint?: unknown): MediaType | null {
  if (typeof hint === "string" && /m3u8|mpegurl|hls/i.test(hint)) return "hls";
  if (typeof hint === "string" && /mp4|webm|video|file/i.test(hint)) return "file";
  if (/\.m3u8(?:[?#]|$)/i.test(url)) return "hls";
  if (/\.(?:mp4|webm)(?:[?#]|$)/i.test(url)) return "file";
  return null;
}

export function resolveMedia(value: unknown, base: string, hint?: unknown): Stream | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let url: string;
  try {
    url = new URL(value.trim(), base).href;
  } catch {
    return null;
  }
  const mediaType = mediaTypeFor(url, hint);
  return mediaType && isHttpUrl(url) ? { url, mediaType, headers: originHeaders(url) } : null;
}

export function originHeaders(url: string): StreamHeaders {
  try {
    const origin = new URL(url).origin;
    return { Origin: origin, Referer: `${origin}/` };
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function findMedia(
  value: unknown,
  base: string,
  headers: StreamHeaders = {}
): Stream | null {
  if (typeof value === "string") {
    const stream = resolveMedia(value, base);
    return stream ? { ...stream, headers: { ...headers, ...stream.headers } } : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const stream = findMedia(item, base, headers);
      if (stream) return stream;
    }
    return null;
  }
  if (!isRecord(value)) return null;

  const inherited = { ...headers };
  for (const key of ["headers", "preferredHeaders"]) {
    const candidate = value[key];
    if (!isRecord(candidate)) continue;
    for (const [name, entry] of Object.entries(candidate)) {
      if (typeof entry === "string" && entry) inherited[name] = entry;
    }
  }
  const hint = value.type ?? value.format ?? value.mimeType;
  for (const key of ["file", "url", "src", "source", "stream", "hls", "mp4"]) {
    const stream = resolveMedia(value[key], base, key === "hls" ? "hls" : hint);
    if (stream) return { ...stream, headers: { ...inherited, ...stream.headers } };
  }
  for (const child of Object.values(value)) {
    const stream = findMedia(child, base, inherited);
    if (stream) return stream;
  }
  return null;
}

export function findMediaInText(text: string, base: string): Stream | null {
  const normalized = text.replace(/\\u0026/g, "&").replace(/\\\//g, "/");
  const urls = normalized.match(/(?:https?:)?\/\/[^\s"'`<>\\]+/gi) ?? [];
  for (const raw of urls) {
    const candidate = raw.startsWith("//") ? `https:${raw}` : raw;
    const stream = resolveMedia(candidate, base);
    if (stream) return stream;
  }
  return null;
}

export function unwrapProxyData(value: string): { url: string; headers: StreamHeaders } | null {
  try {
    const parsed = new URL(value);
    if (!/proxy/i.test(parsed.pathname)) return null;
    const raw = parsed.searchParams.get("data");
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || typeof data.url !== "string" || !isHttpUrl(data.url)) return null;
    const headers: StreamHeaders = {};
    if (isRecord(data.headers)) {
      for (const [name, entry] of Object.entries(data.headers)) {
        if (typeof entry === "string" && entry) headers[name] = entry;
      }
    }
    return { url: data.url, headers };
  } catch {
    return null;
  }
}
