import { INSECURE_TLS } from "../../fetcher";
import { isHttpUrl, originHeaders, resolveMedia } from "../../media";
import type { Stream, StreamHeaders } from "../../../types";

const HOST = "player.videasy.net";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const PLAYER_ORIGIN = "https://player.videasy.net";
const DECODER_URL = "https://enc-dec.app/api/dec-videasy";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8_000;
const SERVERS = [
  { name: "cdn", url: "https://api.speedracelight.com/cdn/sources-with-title" },
  { name: "m4uhd", url: "https://api.speedracelight.com/m4uhd/sources-with-title" },
  { name: "vsrc", url: "https://api.speedracelight.com/vsrc/sources-with-title" },
  { name: "hdmovie", url: "https://api.speedracelight.com/hdmovie/sources-with-title" },
  { name: "lamovie", url: "https://api.speedracelight.com/lamovie/sources-with-title" },
  { name: "superflix", url: "https://api.speedracelight.com/superflix/sources-with-title" }
] as const;

const API_HEADERS: StreamHeaders = {
  "User-Agent": USER_AGENT,
  Accept: "application/json, */*; q=0.01",
  Referer: `${PLAYER_ORIGIN}/`,
  Origin: PLAYER_ORIGIN
};

type Request =
  { id: string; type: "movie" } | { id: string; type: "tv"; season: string; episode: string };

type Metadata = { title: string; year: string; imdbId: string };
type RawSource = { url: string; type?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.hostname !== HOST) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [type, id, season, episode] = parts;
    if (!id || !/^\d{1,10}$/.test(id)) return null;
    if (type === "movie" && parts.length === 2) return { id, type };
    if (type !== "tv" || parts.length !== 4 || !season || !episode) return null;
    if (!/^\d{1,4}$/.test(season) || !/^\d{1,4}$/.test(episode) || Number(episode) < 1) return null;
    return { id, type, season, episode };
  } catch {
    return null;
  }
}

async function fetchText(
  url: string,
  headers: StreamHeaders,
  body?: string
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? headers : { ...headers, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body }),
      signal: controller.signal,
      ...INSECURE_TLS
    });
    const text = await response.text();
    console.log(
      `[videasy] ${body === undefined ? "GET" : "POST"} ${url} -> ${response.status} (${response.headers.get("content-type") ?? ""})`
    );
    if (!response.ok) console.log(`[videasy] response body: ${text.slice(0, 180)}`);
    return text || null;
  } catch (error) {
    console.log(`[videasy] request failed: ${error instanceof Error ? error.message : error}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url: string, headers: StreamHeaders): Promise<unknown | null> {
  const text = await fetchText(url, headers);
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    console.log(`[videasy] response was not JSON: ${text.slice(0, 180)}`);
    return null;
  }
}

async function loadMetadata(request: Request): Promise<Metadata> {
  const url = new URL(`${TMDB_API}/${request.type}/${request.id}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("append_to_response", "external_ids");
  const value = await fetchJson(url.href, { "User-Agent": USER_AGENT, Accept: "application/json" });
  if (!isRecord(value)) return { title: "", year: "", imdbId: "" };
  const titleValue = request.type === "movie" ? value.title : value.name;
  const dateValue = request.type === "movie" ? value.release_date : value.first_air_date;
  const externalIds = value.external_ids;
  const imdbId =
    isRecord(externalIds) && typeof externalIds.imdb_id === "string" ? externalIds.imdb_id : "";
  const year = typeof dateValue === "string" ? dateValue.slice(0, 4) : "";
  return {
    title: typeof titleValue === "string" ? titleValue : "",
    year: /^\d{4}$/.test(year) ? year : "",
    imdbId
  };
}

function buildApiUrl(serverUrl: string, request: Request, metadata: Metadata): string {
  const url = new URL(serverUrl);
  // The current API decodes the title once before searching, so its query value
  // must be double encoded (URLSearchParams performs the outer encoding).
  url.searchParams.set("title", encodeURIComponent(metadata.title));
  url.searchParams.set("mediaType", request.type);
  url.searchParams.set("tmdbId", request.id);
  url.searchParams.set("imdbId", metadata.imdbId);
  url.searchParams.set("episodeId", request.type === "tv" ? request.episode : "1");
  url.searchParams.set("seasonId", request.type === "tv" ? request.season : "1");
  url.searchParams.set("year", metadata.year);
  return url.href;
}

async function loadSeed(tmdbId: string): Promise<string | null> {
  const url = new URL("https://api.speedracelight.com/seed");
  url.searchParams.set("mediaId", tmdbId);
  const value = await fetchJson(url.href, API_HEADERS);
  if (!isRecord(value) || typeof value.seed !== "string" || value.seed.length === 0) {
    console.log("[videasy] seed response did not contain a seed");
    return null;
  }
  return value.seed;
}

function readSources(value: unknown): RawSource[] {
  if (!isRecord(value) || !Array.isArray(value.sources)) return [];
  return value.sources.flatMap((source): RawSource[] => {
    if (!isRecord(source) || typeof source.url !== "string") return [];
    return [{ url: source.url, ...(typeof source.type === "string" ? { type: source.type } : {}) }];
  });
}

async function decryptPayload(blob: string, tmdbId: string, seed: string): Promise<unknown | null> {
  const text = await fetchText(
    DECODER_URL,
    { "User-Agent": USER_AGENT, Accept: "application/json" },
    JSON.stringify({ text: blob, id: tmdbId, seed })
  );
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value) || value.status !== 200) return null;
    return value.result;
  } catch {
    console.log("[videasy] decoder response was not JSON:", text.slice(0, 180));
    return null;
  }
}

function readTracks(value: unknown): unknown[] | undefined {
  if (!isRecord(value) || !Array.isArray(value.subtitles)) return undefined;
  const seen = new Set<string>();
  const tracks = value.subtitles.flatMap((track) => {
    if (!isRecord(track) || typeof track.url !== "string") return [];
    try {
      const file = new URL(track.url, PLAYER_ORIGIN).href;
      if (!isHttpUrl(file) || seen.has(file)) return [];
      seen.add(file);
      const label =
        typeof track.lang === "string"
          ? track.lang
          : typeof track.language === "string"
            ? track.language
            : "Unknown";
      return [{ file, label, type: "vtt" }];
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
    const response = await fetch(stream.url, {
      headers: {
        "User-Agent": USER_AGENT,
        ...stream.headers,
        ...(stream.mediaType === "file" ? { Range: "bytes=0-1023" } : {})
      },
      signal: controller.signal,
      ...INSECURE_TLS
    });
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      const playable = response.ok && body.startsWith("#EXTM3U");
      console.log(
        `[videasy] HLS probe ${response.status}: ${playable ? "valid playlist" : body.slice(0, 120)}`
      );
      return playable;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    const playable =
      (response.status === 200 || response.status === 206) &&
      !/text\/|html|json|xml/.test(contentType);
    console.log(
      `[videasy] file probe ${response.status} ${contentType}: ${playable ? "valid file" : "rejected"}`
    );
    return playable;
  } catch (error) {
    console.log(`[videasy] media probe failed: ${error instanceof Error ? error.message : error}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveServer(
  request: Request,
  metadata: Metadata,
  seed: string,
  server: (typeof SERVERS)[number]
): Promise<Stream | null> {
  const apiUrl = buildApiUrl(server.url, request, metadata);
  const sourceUrl = new URL(apiUrl);
  sourceUrl.searchParams.set("enc", "2");
  sourceUrl.searchParams.set("seed", seed);
  const blob = await fetchText(sourceUrl.href, API_HEADERS);
  if (!blob || blob.length < 10) return null;
  const decrypted = await decryptPayload(blob, request.id, seed);
  const sources = readSources(decrypted);
  console.log(`[videasy] ${server.name}: decrypted ${sources.length} source(s)`);
  for (const source of sources) {
    if (/\/(?:demo-video|sample-video)\.mp4(?:[?#]|$)/i.test(source.url)) continue;
    const stream = resolveMedia(source.url, server.url, source.type);
    if (!stream) continue;
    const headers: StreamHeaders = { ...originHeaders(stream.url), ...API_HEADERS };
    const candidate = { ...stream, headers };
    if (await probe(candidate)) {
      const tracks = readTracks(decrypted);
      return { ...candidate, ...(tracks ? { tracks } : {}) };
    }
  }
  return null;
}

export async function resolveVideasy(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) return null;
  console.log(
    `[videasy] resolving ${request.type} ${request.id}${request.type === "tv" ? ` S${request.season}E${request.episode}` : ""}`
  );
  const metadata = await loadMetadata(request);
  if (!metadata.title || !metadata.year) {
    console.log("[videasy] TMDB metadata is missing a title or year");
    return null;
  }
  const seed = await loadSeed(request.id);
  if (!seed) return null;
  const attempts = SERVERS.map((server) =>
    resolveServer(request, metadata, seed, server).catch((error) => {
      console.log(
        `[videasy] ${server.name} failed:`,
        error instanceof Error ? error.message : error
      );
      return null;
    })
  );
  for (const attempt of attempts) {
    const stream = await attempt;
    if (stream) return stream;
  }
  console.log("[videasy] no verified stream found");
  return null;
}
