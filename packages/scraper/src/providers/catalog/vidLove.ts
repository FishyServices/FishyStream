import { INSECURE_TLS, isPlayableStream } from "../fetcher";
import { findMedia, findMediaInText, isHttpUrl, resolveMedia } from "../media";
import type { Stream, StreamHeaders, StreamSourceOption } from "../../types";

const PLAYER_ORIGIN = "https://player.vidlove.cc";
const API_ORIGIN = "https://api.vidlove.cc";
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const log = (...args: unknown[]) => console.log("[vidlove]", ...args);
let sourceCache: { values: { key: string; name: string }[]; expires: number } | undefined;

type VidLoveSource = { key: string; name: string };

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiUrlFor(target: string, sourceId: string): string | null {
  try {
    const url = new URL(target);
    const [root, kind, id, season, episode] = url.pathname.split("/").filter(Boolean);
    if (
      url.hostname !== "player.vidlove.cc" ||
      root !== "embed" ||
      !id ||
      (kind !== "movie" && kind !== "tv")
    ) {
      return null;
    }
    const api = new URL(`/${kind}`, API_ORIGIN);
    api.searchParams.set("id", id);
    api.searchParams.set("mode", "json");
    api.searchParams.set("sources", sourceId);
    if (sourceId === "dcloud") api.searchParams.set("sw", "1");
    else api.searchParams.set("hevc", "1");
    if (kind === "tv") {
      if (!season || !episode) return null;
      api.searchParams.set("season", season);
      api.searchParams.set("episode", episode);
    }
    return api.href;
  } catch {
    return null;
  }
}

function sourcePairs(script: string): VidLoveSource[] {
  const assignments =
    /([\w$]+)=(\[(?:\["[^"\r\n]{1,100}","[a-z\d_-]{1,50}"\],?){2,}\]),[\w$]+=\1\.map/g;
  for (const match of script.matchAll(assignments)) {
    if (!match[2]) continue;
    const context = script.slice(match.index, match.index + 1400);
    if (!context.includes("mode=json") || !context.includes("sources=")) continue;
    const values = [...match[2].matchAll(/\["([^"\r\n]+)","([a-z\d_-]+)"\]/g)]
      .map(([, name, key]) => (name && key ? { key, name } : null))
      .filter((value): value is VidLoveSource => value !== null);
    if (values.length > 0) return values;
  }
  return [];
}

async function discoverSources(target: string): Promise<VidLoveSource[]> {
  if (sourceCache && sourceCache.expires > Date.now()) return sourceCache.values;
  try {
    const page = await fetch(target, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html", Referer: `${PLAYER_ORIGIN}/` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...INSECURE_TLS
    });
    if (!page.ok) {
      log(`player HTML returned HTTP ${page.status}`);
      return [];
    }
    const html = await page.text();
    const scripts = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)]
      .map((match) => match[1])
      .filter((path): path is string => typeof path === "string");
    for (const path of scripts) {
      const scriptUrl = new URL(path, target);
      if (scriptUrl.origin !== PLAYER_ORIGIN) continue;
      const response = await fetch(scriptUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/javascript,*/*", Referer: target },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...INSECURE_TLS
      });
      if (!response.ok) continue;
      const sources = sourcePairs(await response.text());
      if (sources.length > 0) {
        sourceCache = { values: sources, expires: Date.now() + 60_000 };
        log(
          `discovered ${sources.length} source IDs from ${scriptUrl.pathname}:`,
          sources.map(({ key }) => key)
        );
        return sources;
      }
    }
  } catch (error) {
    log(
      "could not discover source IDs from player HTML/JavaScript:",
      error instanceof Error ? error.message : error
    );
  }
  log("player bundle did not expose a source list");
  return [];
}

function parseRequest(
  target: string
): { kind: "movie" | "tv"; id: string; season?: string; episode?: string } | null {
  try {
    const url = new URL(target);
    const [root, kind, id, season, episode] = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== "player.vidlove.cc" || root !== "embed" || !id || !/^\d+$/.test(id))
      return null;
    if (kind === "movie" && !season) return { kind, id };
    if (kind === "tv" && season && episode && /^\d+$/.test(season) && /^\d+$/.test(episode))
      return { kind, id, season, episode };
    return null;
  } catch {
    return null;
  }
}

async function resolveSourceUrl(value: string, hint?: unknown): Promise<Stream | null> {
  const direct = resolveMedia(value, PLAYER_ORIGIN, hint);
  if (direct) return direct;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.hostname !== "d.ravenflix.st" || url.pathname !== "/api") return null;
  url.searchParams.set("v", "0");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, application/vnd.apple.mpegurl, */*",
        Referer: `${PLAYER_ORIGIN}/`
      },
      signal: controller.signal,
      ...INSECURE_TLS
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    log(`nested GET ${url.origin}${url.pathname} -> ${response.status} ${contentType}`);
    if (!response.ok) return null;
    if (/mpegurl|vnd\.apple\.mpegurl/i.test(contentType)) {
      return {
        url: response.url || url.href,
        mediaType: "hls",
        headers: { Referer: `${PLAYER_ORIGIN}/` }
      };
    }
    if (/^video\//i.test(contentType)) {
      return {
        url: response.url || url.href,
        mediaType: "file",
        headers: { Referer: `${PLAYER_ORIGIN}/` }
      };
    }
    const text = await response.text();
    if (contentType.includes("json")) {
      try {
        return findMedia(JSON.parse(text) as unknown, response.url || url.href);
      } catch {
        log("nested response was invalid JSON");
        return null;
      }
    }
    return findMediaInText(text, response.url || url.href);
  } catch (error) {
    log("nested MovieBox request failed:", error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function readTracks(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tracks = value.flatMap((track) => {
    if (!isRecord(track) || typeof track.file !== "string") return [];
    try {
      const file = new URL(track.file, PLAYER_ORIGIN).href;
      return isHttpUrl(file) ? [{ ...track, file }] : [];
    } catch {
      return [];
    }
  });
  return tracks.length > 0 ? tracks : undefined;
}

async function resolveVidLoveInternal(
  target: string,
  selectedSource?: string
): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse request from", target);
    return null;
  }
  const availableSources = await discoverSources(target);
  const sources = selectedSource
    ? availableSources.filter(({ key }) => key === selectedSource)
    : availableSources;
  if (selectedSource && sources.length === 0) {
    log(`unknown source key: ${selectedSource}`);
    return null;
  }

  for (const { key: sourceId } of sources) {
    const apiUrl = apiUrlFor(target, sourceId);
    if (!apiUrl) continue;
    log(`requesting ${sourceId} sources`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = Date.now();
    let payload: unknown;
    try {
      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/plain, */*",
          Origin: PLAYER_ORIGIN,
          Referer: `${PLAYER_ORIGIN}/`
        },
        signal: controller.signal,
        ...INSECURE_TLS
      });
      log(
        `${sourceId} GET ${new URL(apiUrl).origin}${new URL(apiUrl).pathname} -> ${response.status} (${Date.now() - started}ms)`
      );
      const text = await response.text();
      if (!response.ok) {
        log(`  ${sourceId} response:`, preview(text));
        continue;
      }
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        log(`  ${sourceId} response was not JSON:`, preview(text));
        continue;
      }
    } catch (error) {
      log(
        `${sourceId} request failed after ${Date.now() - started}ms:`,
        error instanceof Error ? error.message : error
      );
      continue;
    } finally {
      clearTimeout(timer);
    }

    const source = isRecord(payload) ? payload.source : null;
    const subtitles = isRecord(payload) ? payload.subtitles : undefined;
    if (!isRecord(source) || typeof source.url !== "string") {
      log(`  ${sourceId} payload has no source.url`);
      continue;
    }
    const hint =
      typeof source.manifest === "string" && /#EXTM3U|#EXT-X-/i.test(source.manifest)
        ? "hls"
        : source.type;
    const stream = await resolveSourceUrl(source.url, hint);
    if (!stream) {
      log(`  ${sourceId} URL did not resolve to a media stream (${new URL(source.url).hostname})`);
      continue;
    }
    const headers: StreamHeaders = { Origin: PLAYER_ORIGIN, Referer: `${PLAYER_ORIGIN}/` };
    const tracks = readTracks(subtitles);
    const result: Stream = {
      ...stream,
      headers: { ...stream.headers, ...headers },
      sourceKey: sourceId,
      name: typeof source.label === "string" ? source.label : sourceId,
      ...(tracks ? { tracks } : {})
    };
    if (!(await isPlayableStream(result))) {
      log(
        `  ${sourceId} media probe failed (${result.mediaType}, ${new URL(result.url).hostname})`
      );
      continue;
    }
    log(`FOUND ${result.mediaType} stream via ${sourceId} (${new URL(result.url).hostname})`);
    return result;
  }
  log("all configured source APIs exhausted");
  return null;
}

export async function resolveVidLove(target: string): Promise<Stream | null> {
  return resolveVidLoveInternal(target);
}

export async function getVidLoveSourceOptions(target: string): Promise<StreamSourceOption[]> {
  if (!parseRequest(target)) return [];
  return (await discoverSources(target)).map(({ key, name }) => ({ key, name }));
}

export async function resolveVidLoveSource(
  target: string,
  sourceKey: string
): Promise<Stream | null> {
  return resolveVidLoveInternal(target, sourceKey);
}
