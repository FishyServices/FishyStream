import { INSECURE_TLS } from "../../fetcher";
import { isHttpUrl, originHeaders, resolveMedia } from "../../media";
import type { Stream, StreamHeaders } from "../../../types";

const HOST = "vaplayer.ru";
const API_URL = "https://streamdata.vaplayer.ru/api.php";
const IFRAME_ORIGIN = "https://nextgencloudfabric.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8_000;
const log = (...values: unknown[]) => console.log("[vaplayer]", ...values);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 300);
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "invalid URL";
  }
}

type Request =
  { id: string; type: "movie" } | { id: string; type: "tv"; season: string; episode: string };

const headers: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, */*",
  Referer: `${IFRAME_ORIGIN}/`,
  Origin: IFRAME_ORIGIN
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.hostname !== HOST) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [root, type, id, season, episode] = parts;
    if (root !== "embed" || !id || !/^(?:\d{1,10}|tt\d{5,10})$/i.test(id)) return null;
    if (type === "movie" && parts.length === 3) return { id, type };
    if (type !== "tv" || parts.length !== 5 || !season || !episode) return null;
    if (!/^\d{1,4}$/.test(season) || !/^\d{1,4}$/.test(episode) || Number(episode) < 1) return null;
    return { id, type, season, episode };
  } catch {
    return null;
  }
}

async function fetchText(url: string, requestHeaders: StreamHeaders): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: requestHeaders,
      signal: controller.signal,
      ...INSECURE_TLS
    });
    const body = await response.text();
    log(
      `GET ${url} -> ${response.status} ${response.headers.get("content-type") ?? ""} (${Date.now() - started}ms)`
    );
    if (!response.ok) log("  response body:", preview(body));
    return body || null;
  } catch (error) {
    log(`GET ${url} failed after ${Date.now() - started}ms:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, requestHeaders: StreamHeaders): Promise<unknown | null> {
  const text = await fetchText(url, requestHeaders);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    log("response was not JSON:", preview(text), error);
    return null;
  }
}

function readSources(payload: unknown): string[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.stream_urls)) {
    return [];
  }
  return payload.data.stream_urls.filter((value): value is string => typeof value === "string");
}

function readTracks(payload: unknown): unknown[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.default_subs)) return undefined;
  const seen = new Set<string>();
  const tracks = payload.default_subs.flatMap((track) => {
    if (!isRecord(track) || typeof track.url !== "string") return [];
    try {
      const file = new URL(track.url, API_URL).href;
      if (!isHttpUrl(file) || seen.has(file)) return [];
      seen.add(file);
      return [
        { file, label: typeof track.lang === "string" ? track.lang : "Subtitle", type: "vtt" }
      ];
    } catch {
      return [];
    }
  });
  return tracks.length ? tracks : undefined;
}

async function probe(stream: Stream): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const requestHeaders = {
      ...headers,
      ...stream.headers,
      ...(stream.mediaType === "file" ? { Range: "bytes=0-1023" } : {})
    };
    let response = await fetch(stream.url, {
      headers: requestHeaders,
      signal: controller.signal,
      ...INSECURE_TLS
    });
    if (response.status === 403) {
      await response.body?.cancel().catch(() => undefined);
      log("retrying media probe with source-origin headers");
      response = await fetch(stream.url, {
        headers: { ...requestHeaders, ...originHeaders(stream.url) },
        signal: controller.signal,
        ...INSECURE_TLS
      });
    }
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      const ok = response.ok && body.startsWith("#EXTM3U");
      log(
        `probe HLS ${response.status} ${response.headers.get("content-type") ?? ""}:`,
        ok ? "playlist" : preview(body)
      );
      return ok;
    }
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    const ok =
      (response.status === 200 || response.status === 206) && !/text\/|html|json|xml/.test(type);
    log(`probe file ${response.status} ${type}:`, ok ? "video file" : "rejected");
    return ok;
  } catch (error) {
    log(
      "media probe failed for",
      hostOf(stream.url),
      error instanceof Error ? error.message : error
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveVaplayer(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse Vaplayer request:", target);
    return null;
  }
  log("request:", JSON.stringify(request));
  try {
    const url = new URL(API_URL);
    url.searchParams.set(/^tt\d+$/i.test(request.id) ? "imdb" : "tmdb", request.id);
    url.searchParams.set("type", request.type);
    if (request.type === "tv") {
      url.searchParams.set("season", request.season);
      url.searchParams.set("episode", request.episode);
    }
    log("requesting sources:", url.href);
    const payload = await fetchJson(url.href, headers);
    if (!isRecord(payload)) {
      log("source response was empty or not an object:", preview(payload));
      return null;
    }
    if (payload.status_code !== "200") {
      log("source API status_code was not 200:", preview(payload));
      return null;
    }
    const sources = readSources(payload);
    log("source URLs returned:", sources.length);
    for (const source of sources) {
      const hint = /\.(?:mp4|mkv)(?:[?#]|$)/i.test(source) ? "file" : "hls";
      const stream = resolveMedia(source, API_URL, hint);
      if (!stream) {
        log("source was not a recognized media URL:", source);
        continue;
      }
      log("probing", stream.mediaType, "source on", hostOf(stream.url));
      const streamHeaders = { "User-Agent": USER_AGENT, ...originHeaders(stream.url), ...headers };
      const candidate = { ...stream, headers: streamHeaders };
      if (await probe(candidate)) {
        log("FOUND", stream.mediaType, "stream:", stream.url);
        const tracks = readTracks(payload);
        return { ...candidate, ...(tracks ? { tracks } : {}) };
      }
    }
    log("no source returned playable media");
  } catch (error) {
    log("resolver failed:", error);
    return null;
  }
  return null;
}
