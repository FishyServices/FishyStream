import { resolveMedia } from "../media";
import { isPlayableStream } from "../fetcher";
import type { Stream, StreamHeaders } from "../../types";

const PLAYER_ORIGIN = "https://player.cinezo.live";
const API_TIMEOUT_MS = 25_000;
const log = (...args: unknown[]) => console.log("[cinezo]", ...args);

type Request =
  { type: "movie"; id: string } | { type: "tv"; id: string; season: string; episode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "player.cinezo.live") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [embed, type, id, season, episode] = parts;
    if (embed !== "embed" || !id || !/^\d{1,10}$/.test(id)) return null;
    if (type === "movie" && parts.length === 3) return { type, id };
    if (
      type === "tv" &&
      parts.length === 5 &&
      season &&
      episode &&
      /^\d{1,4}$/.test(season) &&
      /^\d{1,4}$/.test(episode)
    ) {
      return { type, id, season, episode };
    }
    return null;
  } catch {
    return null;
  }
}

function sourceUrls(request: Request): string[] {
  const kind = request.type === "tv" ? "tv" : "movie";
  const query = new URLSearchParams({ id: request.id });
  if (request.type === "tv") {
    query.set("season", request.season);
    query.set("episode", request.episode);
  }

  const punkflix =
    request.type === "tv"
      ? `https://punkflix.net/tv/${request.id}/${request.season}/${request.episode}.json`
      : `https://punkflix.net/movie/${request.id}.json`;
  return [punkflix, `https://proxy1.flikhub.net/${kind}?${query}`];
}

function parsePayloads(text: string): unknown[] {
  try {
    return [JSON.parse(text) as unknown];
  } catch {
    const payloads: unknown[] = [];
    for (const match of text.matchAll(/^data:\s*(\{.*\})\s*$/gm)) {
      const data = match[1];
      if (!data) continue;
      try {
        payloads.push(JSON.parse(data) as unknown);
      } catch {}
    }
    return payloads;
  }
}

async function fetchPayloads(url: string): Promise<unknown[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/event-stream",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: `${PLAYER_ORIGIN}/`
      },
      signal: controller.signal
    });
    log(`GET ${new URL(url).origin}${new URL(url).pathname} -> ${response.status}`);
    if (!response.ok) {
      log("  response body:", (await response.text()).slice(0, 250));
      return [];
    }
    const text = await response.text();
    const payloads = parsePayloads(text);
    if (payloads.length === 0)
      log("  response contained no JSON or SSE source events:", text.slice(0, 250));
    else log(`  parsed ${payloads.length} JSON/SSE event(s)`);
    return payloads;
  } catch (error) {
    log("  request failed:", error instanceof Error ? error.message : error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function readStream(value: unknown, base: string): Stream | null {
  if (!isRecord(value)) return null;
  const stream = isRecord(value.stream) ? value.stream : value;
  const source = isRecord(value.source) ? value.source : value;
  const candidate =
    (typeof stream.hls === "string" && stream.hls) ||
    (typeof stream.remux === "string" && stream.remux) ||
    (typeof stream.original === "string" && stream.original) ||
    (typeof value.url === "string" && value.url) ||
    (typeof source.url === "string" && source.url);
  const hint = source.type ?? stream.type;
  const media = resolveMedia(candidate, base, hint);
  if (!media) return null;

  const headers: StreamHeaders = {
    ...media.headers,
    Referer: `${PLAYER_ORIGIN}/`,
    Origin: PLAYER_ORIGIN
  };
  return { ...media, headers };
}

export async function resolveCinezo(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse player URL:", target);
    return null;
  }
  log("resolving", request);

  for (const apiUrl of sourceUrls(request)) {
    for (const payload of await fetchPayloads(apiUrl)) {
      const stream = readStream(payload, apiUrl);
      if (!stream) continue;
      if (await isPlayableStream(stream)) {
        log(`FOUND ${stream.mediaType} stream on ${new URL(stream.url).hostname}`);
        return stream;
      }
      log(
        `  ${stream.mediaType} candidate failed the playback probe (${new URL(stream.url).hostname})`
      );
    }
  }
  log("all source APIs exhausted");
  return null;
}
