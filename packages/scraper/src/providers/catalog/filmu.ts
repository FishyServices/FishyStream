import { fetchProvider, isPlayableStream } from "../fetcher";
import { findMedia, findMediaInText, resolveMedia } from "../media";
import type { Stream, StreamSourceOption } from "../../types";

type FilmUServer = { id: string; label: string };
type FilmUContext = { params: URLSearchParams; origin: string; referer: string };
type FilmUSources = { servers: FilmUServer[]; streams: unknown[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function playerHeaders(pageUrl: string): { Origin: string; Referer: string } {
  return { Origin: new URL(pageUrl).origin, Referer: pageUrl };
}

function isFilmuPlayerUrl(target: string): boolean {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "embed.filmu.in" || url.port) return false;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "embed") parts.shift();
    if (parts[0] === "movie") return parts.length === 2 && /^\d{1,10}$/.test(parts[1]!);
    if (parts[0] === "tv")
      return (
        parts.length === 4 &&
        /^\d{1,10}$/.test(parts[1]!) &&
        /^\d{1,4}$/.test(parts[2]!) &&
        /^\d{1,4}$/.test(parts[3]!) &&
        Number(parts[3]) > 0
      );
    if (parts[0] === "anime")
      return parts.length === 3 && /^\d{1,12}$/.test(parts[1]!) && /^\d{1,4}$/.test(parts[2]!);
    return false;
  } catch {
    return false;
  }
}

function readPreloadedMedia(html: string, base: string): Stream | null {
  for (const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
    const tag = match[0] ?? "";
    if (!/\brel=["']preload["']/i.test(tag)) continue;
    const raw = match[1]?.replace(/&amp;/g, "&").replace(/\\u0026/g, "&");
    if (!raw) continue;
    try {
      const url = new URL(raw, base);
      if (url.protocol !== "https:") continue;
      if (url.pathname.endsWith("/proxy/m3u8") || url.pathname.startsWith("/p/"))
        return { url: url.href, mediaType: "hls", headers: playerHeaders(base) };
      const direct = resolveMedia(url.href, base);
      if (direct) return { ...direct, headers: { ...direct.headers, ...playerHeaders(base) } };
    } catch {
      continue;
    }
  }
  return null;
}

function makeFilmUContext(target: string, html: string, pageUrl: string): FilmUContext | null {
  const match = html.match(/token\\":\\"([^\\"]+)/);
  if (!match?.[1]) return null;
  const url = new URL(target);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "embed") parts.shift();
  const [kind, id, season, episode] = parts;
  if (!kind || !id) return null;
  const params = new URLSearchParams({ kind, t: match[1], provider: "auto" });
  if (kind === "movie") params.set("tmdb", id);
  else if (kind === "tv") {
    params.set("tmdb", id);
    if (season) params.set("s", season);
    if (episode) params.set("e", episode);
  } else if (kind === "anime") {
    params.set("anilist", id);
    if (episode) params.set("e", episode);
  } else return null;
  return { params, origin: new URL(pageUrl).origin, referer: pageUrl };
}

function decryptSources(value: string): unknown {
  if (!value.startsWith("v1.")) throw new Error("FilmU returned an unsupported source response");
  const binary = atob(value.slice(3).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const nonce = bytes.subarray(0, 12);
  const data = bytes.slice(12);
  const key = "vY7#qL2!mZ9@wK4$";
  const state = Array.from({ length: 4 }, (_, index) => {
    let hash = (0x811c9dc5 ^ Math.imul(0x9e3779b9, index)) >>> 0;
    for (let offset = 0; offset < key.length; offset += 1)
      hash = Math.imul(hash ^ key.charCodeAt(offset), 0x01000193) >>> 0;
    for (const byte of nonce) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    return hash;
  });
  let [a, b, c, d] = state as [number, number, number, number];
  let word = 0;
  for (let index = 0; index < data.length; index += 1) {
    if ((index & 3) === 0) {
      c >>>= 0;
      d >>>= 0;
      let sum = ((a >>> 0) + (b >>> 0)) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (((c << 21) | (c >>> 11)) + (sum = (sum + (d = (d + 1) | 0)) | 0)) | 0;
      word = sum >>> 0;
    }
    data[index] = data[index]! ^ ((word >>> ((index & 3) * 8)) & 255);
  }
  return JSON.parse(new TextDecoder().decode(data)) as unknown;
}

async function requestFilmUSources(
  context: FilmUContext,
  provider: string
): Promise<FilmUSources | null> {
  const params = new URLSearchParams(context.params);
  params.set("provider", provider);
  const response = await fetchProvider(`${context.origin}/api/sources?${params}`, {
    Accept: "application/json, text/plain, */*",
    Origin: context.origin,
    Referer: context.referer
  });
  if (!response.ok) return null;
  const payload: unknown = decryptSources(await response.text());
  if (!isRecord(payload)) return null;
  const servers = Array.isArray(payload.servers)
    ? payload.servers.flatMap((server): FilmUServer[] =>
        isRecord(server) && typeof server.id === "string" && typeof server.label === "string"
          ? [{ id: server.id, label: server.label }]
          : []
      )
    : [];
  return { servers, streams: Array.isArray(payload.streams) ? payload.streams : [] };
}

function streamFromSources(
  payload: FilmUSources,
  provider: string,
  pageUrl: string
): Stream | null {
  for (const item of payload.streams) {
    if (!isRecord(item) || typeof item.url !== "string") continue;
    const stream = resolveMedia(item.url, pageUrl, item.type);
    if (!stream) continue;
    const tracks = Array.isArray(item.subtitles)
      ? item.subtitles.flatMap((track) =>
          isRecord(track) && typeof track.url === "string"
            ? [
                {
                  file: track.url,
                  label: typeof track.label === "string" ? track.label : "Subtitles"
                }
              ]
            : []
        )
      : [];
    const label = typeof item.label === "string" ? item.label : provider;
    return {
      ...stream,
      headers: { ...stream.headers, ...playerHeaders(pageUrl) },
      name: label,
      sourceKey: provider,
      tracks
    };
  }
  return null;
}

async function loadFilmUPage(target: string) {
  const page = await fetchProvider(target, {
    Accept: "text/html,application/json,*/*",
    Referer: `${new URL(target).origin}/`
  });
  if (!page.ok) return null;
  const html = await page.text();
  return { html, base: page.url || target };
}

export async function getFilmuSourceOptions(target: string): Promise<StreamSourceOption[]> {
  try {
    const page = await loadFilmUPage(target);
    if (!page) return [];
    const context = makeFilmUContext(target, page.html, page.base);
    if (!context) return [];
    const available = await requestFilmUSources(context, "auto");
    if (!available) return [];
    const results = await Promise.all(
      available.servers.map(async (server) => ({
        server,
        payload: await requestFilmUSources(context, server.id).catch(() => null)
      }))
    );
    return results
      .filter(({ payload }) => payload && payload.streams.length > 0)
      .map(({ server }) => ({ key: server.id, name: server.label }));
  } catch {
    return [];
  }
}

export async function resolveFilmuSource(
  target: string,
  sourceKey: string
): Promise<Stream | null> {
  try {
    const page = await loadFilmUPage(target);
    if (!page) return null;
    const context = makeFilmUContext(target, page.html, page.base);
    if (!context) return null;
    const payload = await requestFilmUSources(context, sourceKey);
    const stream = payload && streamFromSources(payload, sourceKey, page.base);
    return stream && (await isPlayableStream(stream)) ? stream : null;
  } catch {
    return null;
  }
}

function mediaFromPage(html: string, base: string): Stream | null {
  return (
    readPreloadedMedia(html, base) ??
    findMediaInText(html, base) ??
    (() => {
      try {
        return findMedia(JSON.parse(html) as unknown, base);
      } catch {
        return null;
      }
    })()
  );
}

export async function resolveFilmu(target: string): Promise<Stream | null> {
  if (!isFilmuPlayerUrl(target)) return null;
  try {
    const page = await loadFilmUPage(target);
    if (!page) return null;
    const context = makeFilmUContext(target, page.html, page.base);
    if (context) {
      const available = await requestFilmUSources(context, "auto");
      for (const server of available?.servers ?? []) {
        const payload = await requestFilmUSources(context, server.id).catch(() => null);
        const stream = payload && streamFromSources(payload, server.id, page.base);
        if (stream && (await isPlayableStream(stream))) return stream;
      }
    }
    const stream = mediaFromPage(page.html, page.base);
    return stream && (await isPlayableStream(stream)) ? stream : null;
  } catch (error) {
    console.warn(
      "[filmu] resolution failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return null;
  }
}

export const __filmuParser = { isFilmuPlayerUrl, readPreloadedMedia };
