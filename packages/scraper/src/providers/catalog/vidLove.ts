import { INSECURE_TLS } from "../fetcher";
import { isHttpUrl, resolveMedia } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const PLAYER_ORIGIN = "https://player.vidlove.cc";
const API_ORIGIN = "https://api.vidlove.cc";
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const log = (...args: unknown[]) => console.log("[vidlove]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function apiUrlFor(target: string): string | null {
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

export async function resolveVidLove(target: string): Promise<Stream | null> {
  const apiUrl = apiUrlFor(target);
  if (!apiUrl) {
    log("could not parse request from", target);
    return null;
  }
  log("request:", apiUrl);

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
    log(`GET ${apiUrl} -> ${response.status} (${Date.now() - started}ms)`);
    const text = await response.text();
    if (!response.ok) {
      log("  body:", preview(text));
      return null;
    }
    log("  raw payload:", preview(text));
    payload = JSON.parse(text);
  } catch (error) {
    log(`request failed after ${Date.now() - started}ms:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!isRecord(payload) || !isRecord(payload.source) || typeof payload.source.url !== "string") {
    log("  payload has no source.url");
    return null;
  }
  const source = payload.source;
  const hint =
    typeof source.manifest === "string" && /#EXTM3U|#EXT-X-/i.test(source.manifest)
      ? "hls"
      : source.type;
  const stream = resolveMedia(source.url, PLAYER_ORIGIN, hint);
  if (!stream) {
    log("  source.url is not a recognised media url:", preview(source.url));
    return null;
  }
  const headers: StreamHeaders = { Origin: PLAYER_ORIGIN, Referer: `${PLAYER_ORIGIN}/` };
  const tracks = readTracks(payload.subtitles);
  log(`FOUND ${stream.mediaType} stream:`, stream.url);
  return { ...stream, headers, ...(tracks ? { tracks } : {}) };
}
