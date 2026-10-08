import { isHttpUrl, resolveMedia } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const PROVIDER_ORIGIN = "https://vidbolt.xyz";
const SCRAPER_ORIGIN = "https://scraper.vidbolt.xyz";
const API_ORIGIN = "https://img.animecurx.tech";
const API_KEY = "streamrip_secret_2026";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;
const MAX_PLAYER_SCRIPTS = 60;

type Request = {
  kind: "movie" | "tv";
  id: string;
  season?: string;
  episode?: string;
  pageUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "vidbolt.xyz" || url.port) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [kind, id, season, episode] = parts;
    if (!id || !/^\d+$/.test(id)) return null;
    if (kind === "movie" && parts.length === 2) return { kind, id, pageUrl: url.href };
    if (
      kind === "tv" &&
      parts.length === 4 &&
      season &&
      episode &&
      /^\d+$/.test(season) &&
      /^\d+$/.test(episode)
    ) {
      return { kind, id, season, episode, pageUrl: url.href };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchText(
  url: string,
  referer: string
): Promise<{ response: Response; text: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Origin: PROVIDER_ORIGIN,
        Referer: referer
      },
      signal: controller.signal
    });
    return { response, text: await response.text() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readPlayerScripts(
  pageUrl: string
): Promise<{ scripts: string[]; pageHtml: string }> {
  const page = await fetchText(pageUrl, pageUrl);
  if (!page?.response.ok) return { scripts: [], pageHtml: "" };

  const queue: string[] = [];
  const scripts = [...page.text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1] ?? "")
    .filter(Boolean);
  for (const match of page.text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(match[1]!, pageUrl);
      if (url.origin === PROVIDER_ORIGIN && url.pathname.endsWith(".js")) queue.push(url.href);
    } catch {
      continue;
    }
  }

  const visited = new Set<string>();
  for (let index = 0; index < queue.length && visited.size < MAX_PLAYER_SCRIPTS; index += 1) {
    const scriptUrl = queue[index]!;
    if (visited.has(scriptUrl)) continue;
    visited.add(scriptUrl);
    const result = await fetchText(scriptUrl, pageUrl);
    if (!result?.response.ok) continue;
    scripts.push(result.text);
    for (const match of result.text.matchAll(/["'`]([^"'`]+\.js(?:\?[^"'`]*)?)["'`]/g)) {
      try {
        const assetUrl = new URL(match[1]!, scriptUrl);
        if (assetUrl.origin === PROVIDER_ORIGIN && !visited.has(assetUrl.href))
          queue.push(assetUrl.href);
      } catch {
        continue;
      }
    }
  }
  return { scripts, pageHtml: page.text };
}

function discoverSourceProviders(scripts: string[]): string[] {
  const providers = new Set<string>();
  for (const script of scripts) {
    for (const match of script.matchAll(/\/scrape\/([A-Za-z0-9_-]+)/g)) providers.add(match[1]!);
  }
  return [...providers];
}

function readPageTitle(scripts: string[], pageHtml: string): string | undefined {
  const metaTitle = pageHtml.match(
    /<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)/i
  )?.[1];
  const htmlTitle = pageHtml.match(/<title[^>]*>([^<]+)/i)?.[1];
  const title = (metaTitle ?? htmlTitle)?.replace(/\s*[|·-].*$/, "").trim();
  if (title) return title;
  for (const script of scripts) {
    const embeddedTitle = script.match(/(?:title|name)\s*[:=]\s*["']([^"']{2,100})["']/i)?.[1];
    if (embeddedTitle) return embeddedTitle;
  }
  return undefined;
}

async function probe(stream: Stream): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { ...stream.headers };
  if (stream.mediaType === "file") headers.Range = "bytes=0-1023";
  try {
    const response = await fetch(stream.url, { headers, signal: controller.signal });
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      return response.ok && body.startsWith("#EXTM3U");
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

function mediaHeaders(): StreamHeaders {
  return { Origin: PROVIDER_ORIGIN, Referer: `${PROVIDER_ORIGIN}/` };
}

export async function resolveVidBolt(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) return null;

  const player = await readPlayerScripts(request.pageUrl);
  const title = readPageTitle(player.scripts, player.pageHtml);
  for (const provider of discoverSourceProviders(player.scripts)) {
    const sourceUrl = new URL(
      `/scrape/${provider}/${request.kind}/tmdb${request.id}`,
      SCRAPER_ORIGIN
    );
    sourceUrl.searchParams.set("tmdbId", request.id);
    if (title) sourceUrl.searchParams.set("title", title);
    if (request.season) sourceUrl.searchParams.set("season", request.season);
    if (request.episode) sourceUrl.searchParams.set("episode", request.episode);

    const sourceResult = await fetchText(sourceUrl.href, request.pageUrl);
    if (!sourceResult?.response.ok) continue;
    let payload: unknown;
    try {
      payload = JSON.parse(sourceResult.text);
    } catch {
      continue;
    }
    if (!isRecord(payload) || !Array.isArray(payload.sources)) continue;
    for (const source of payload.sources) {
      if (!isRecord(source) || typeof source.url !== "string") continue;
      const media = resolveMedia(source.url, SCRAPER_ORIGIN, source.type);
      if (!media || !isHttpUrl(media.url)) continue;
      const sourceHeaders = isRecord(source.headers)
        ? Object.fromEntries(
            Object.entries(source.headers).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : {};
      const stream: Stream = {
        ...media,
        headers: { ...mediaHeaders(), ...sourceHeaders }
      };
      if (await probe(stream)) return stream;
    }
  }

  const path =
    request.kind === "movie"
      ? `/api/movie/${request.id}`
      : `/api/tv/${request.id}/${request.season}/${request.episode}`;
  const apiUrl = new URL(path, API_ORIGIN);
  apiUrl.searchParams.set("api_key", API_KEY);
  apiUrl.searchParams.set("apikey", API_KEY);

  try {
    const result = await fetchText(apiUrl.href, request.pageUrl);
    if (!result?.response.ok) return null;
    let payload: unknown;
    try {
      payload = JSON.parse(result.text);
    } catch {
      return null;
    }
    if (!isRecord(payload) || !Array.isArray(payload.sources)) return null;

    for (const source of payload.sources) {
      if (!isRecord(source) || typeof source.url !== "string") continue;
      const media = resolveMedia(source.url, API_ORIGIN, source.type);
      if (!media || !isHttpUrl(media.url)) continue;
      const stream: Stream = { ...media, headers: mediaHeaders() };
      if (await probe(stream)) return stream;
    }
    return null;
  } catch {
    return null;
  }
}
