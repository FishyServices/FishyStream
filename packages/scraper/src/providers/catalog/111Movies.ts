import { INSECURE_TLS, isPlayableStream } from "../fetcher";
import { findMedia, findMediaInText, isHttpUrl, resolveMedia } from "../media";
import type { Stream, StreamHeaders, StreamSourceOption } from "../../types";

const HOST = "111movies.net";
const PLAYER_HOST = "player.vidlove.cc";
const PLAYER_ORIGIN = `https://${PLAYER_HOST}`;
const API_ORIGIN = "https://api.vidlove.cc";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;
const sourceCache = new Map<string, { values: StreamSourceOption[]; expires: number }>();

type Request =
  { id: string; type: "movie" } | { id: string; type: "tv"; season: string; episode: string };
type PlayerTarget = {
  url: string;
  id: string;
  type: Request["type"];
  season?: string;
  episode?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== HOST || url.port) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [type, id, season, episode] = parts;
    if (!id || !/^(?:\d{1,10}|tt\d{5,12})$/.test(id)) return null;
    if (type === "movie" && parts.length === 2) return { id, type };
    if (
      type === "tv" &&
      parts.length === 4 &&
      season &&
      episode &&
      /^\d{1,4}$/.test(season) &&
      /^\d{1,4}$/.test(episode) &&
      Number(episode) > 0
    ) {
      return { id, type, season, episode };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html, */*" },
      redirect: "follow",
      signal: controller.signal,
      ...INSECURE_TLS
    });
    console.log(
      `[111movies] GET ${url} -> ${response.status} (${Date.now() - started}ms), final ${response.url}`
    );
    return response;
  } catch (error) {
    console.log(`[111movies] redirect lookup failed after ${Date.now() - started}ms:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveTmdbId(id: string, type: Request["type"]): Promise<string | null> {
  if (!id.startsWith("tt")) return id;
  const url = new URL(`${TMDB_API}/find/${encodeURIComponent(id)}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("external_source", "imdb_id");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url.href, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
      ...INSECURE_TLS
    });
    const body: unknown = await response.json();
    if (!response.ok || !isRecord(body)) return null;
    const results = type === "movie" ? body.movie_results : body.tv_results;
    if (!Array.isArray(results)) return null;
    const first = results[0];
    if (!isRecord(first)) return null;
    return typeof first.id === "number" || typeof first.id === "string" ? String(first.id) : null;
  } catch (error) {
    console.log(`[111movies] IMDb to TMDB lookup failed:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getPlayerTarget(target: string): Promise<PlayerTarget | null> {
  const request = parseRequest(target);
  if (!request) return null;

  const response = await fetchWithTimeout(target);
  if (!response) return null;
  await response.body?.cancel().catch(() => undefined);

  let playerUrl: URL;
  try {
    playerUrl = new URL(response.url);
  } catch {
    console.log("[111movies] redirect ended at an invalid URL");
    return null;
  }
  const expectedPath =
    request.type === "movie"
      ? `/embed/movie/${request.id}`
      : `/embed/tv/${request.id}/${request.season}/${request.episode}`;
  if (
    response.status < 200 ||
    response.status >= 400 ||
    playerUrl.hostname !== PLAYER_HOST ||
    playerUrl.pathname !== expectedPath
  ) {
    console.log("[111movies] expected redirect to the VidLove player was not found");
    return null;
  }

  const tmdbId = await resolveTmdbId(request.id, request.type);
  if (!tmdbId) return null;
  return {
    url: `${PLAYER_ORIGIN}${expectedPath}`,
    id: tmdbId,
    type: request.type,
    ...(request.type === "tv" ? { season: request.season, episode: request.episode } : {})
  };
}

function sourcePairs(script: string): StreamSourceOption[] {
  const assignments =
    /([\w$]+)=(\[(?:\["[^"\r\n]{1,100}","[a-z\d_-]{1,50}"\],?){2,}\]),[\w$]+=\1\.map/g;
  for (const match of script.matchAll(assignments)) {
    if (!match[2]) continue;
    const context = script.slice(match.index, match.index + 1400);
    if (!context.includes("mode=json") || !context.includes("sources=")) continue;
    const options = [...match[2].matchAll(/\["([^"\r\n]+)","([a-z\d_-]+)"\]/g)]
      .map(([, name, key]) => (name && key ? { key, name } : null))
      .filter((option): option is StreamSourceOption => option !== null);
    if (options.length) return options;
  }
  return [];
}

async function discoverSources(playerTarget: string): Promise<StreamSourceOption[]> {
  const cached = sourceCache.get(playerTarget);
  if (cached && cached.expires > Date.now()) return cached.values;
  try {
    const page = await fetch(playerTarget, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html", Referer: `${PLAYER_ORIGIN}/` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...INSECURE_TLS
    });
    if (!page.ok) return [];
    const html = await page.text();
    for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/gi)) {
      if (!match[1]) continue;
      const scriptUrl = new URL(match[1], playerTarget);
      if (scriptUrl.origin !== PLAYER_ORIGIN) continue;
      const script = await fetch(scriptUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/javascript,*/*",
          Referer: playerTarget
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...INSECURE_TLS
      });
      if (!script.ok) continue;
      const options = sourcePairs(await script.text());
      if (options.length) {
        sourceCache.set(playerTarget, { values: options, expires: Date.now() + 60_000 });
        console.log(
          `[111movies] discovered ${options.length} servers:`,
          options.map(({ key }) => key)
        );
        return options;
      }
    }
  } catch (error) {
    console.log("[111movies] source discovery failed:", error);
  }
  console.log("[111movies] player bundle did not expose a server list");
  return [];
}

function sourceApiUrl(player: PlayerTarget, sourceKey: string): string {
  const api = new URL(`/${player.type}`, API_ORIGIN);
  api.searchParams.set("id", player.id);
  api.searchParams.set("mode", "json");
  api.searchParams.set("sources", sourceKey);
  api.searchParams.set("hevc", "1");
  api.searchParams.set("vh", "1");
  if (player.type === "tv") {
    api.searchParams.set("season", player.season!);
    api.searchParams.set("episode", player.episode!);
  }
  return api.href;
}

async function resolveSourceUrl(
  value: string,
  referer: string,
  hint?: unknown
): Promise<Stream | null> {
  const direct = resolveMedia(value, PLAYER_ORIGIN, hint);
  if (direct) return direct;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!url.hostname.endsWith(".ravenflix.st") || url.pathname !== "/api") return null;
  url.searchParams.set("v", "0");
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, application/vnd.apple.mpegurl, */*",
        Referer: referer
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...INSECURE_TLS
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (/mpegurl|vnd\.apple\.mpegurl/i.test(contentType))
      return {
        url: response.url || url.href,
        mediaType: "hls",
        headers: { Referer: `${PLAYER_ORIGIN}/` }
      };
    if (/^video\//i.test(contentType))
      return {
        url: response.url || url.href,
        mediaType: "file",
        headers: { Referer: `${PLAYER_ORIGIN}/` }
      };
    const text = await response.text();
    if (contentType.includes("json")) {
      try {
        return findMedia(JSON.parse(text) as unknown, response.url || url.href);
      } catch {
        return null;
      }
    }
    return findMediaInText(text, response.url || url.href);
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
  return tracks.length ? tracks : undefined;
}

async function resolve111MoviesInternal(
  target: string,
  selectedSource?: string
): Promise<Stream | null> {
  const player = await getPlayerTarget(target);
  if (!player) return null;
  const availableSources = await discoverSources(player.url);
  if (selectedSource && !availableSources.some(({ key }) => key === selectedSource)) {
    console.log(`[111movies] unknown server: ${selectedSource}`);
    return null;
  }
  const sources = selectedSource
    ? availableSources.filter(({ key }) => key === selectedSource)
    : availableSources;
  const headers: StreamHeaders = { Origin: PLAYER_ORIGIN, Referer: player.url };
  for (const source of sources) {
    const apiUrl = sourceApiUrl(player, source.key);
    try {
      const response = await fetch(apiUrl, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/plain, */*",
          ...headers
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        ...INSECURE_TLS
      });
      if (!response.ok) continue;
      const payload: unknown = await response.json();
      if (
        !isRecord(payload) ||
        !isRecord(payload.source) ||
        typeof payload.source.url !== "string"
      ) {
        console.log(`[111movies] ${source.key} returned no source URL`);
        continue;
      }
      const hint =
        typeof payload.source.manifest === "string" &&
        /#EXTM3U|#EXT-X-/i.test(payload.source.manifest)
          ? "hls"
          : payload.source.type;
      const stream = await resolveSourceUrl(payload.source.url, player.url, hint);
      if (!stream) continue;
      const tracks = readTracks(payload.subtitles);
      const result: Stream = {
        ...stream,
        headers: { ...stream.headers, ...headers },
        sourceKey: source.key,
        name: typeof payload.source.label === "string" ? payload.source.label : source.name,
        ...(tracks ? { tracks } : {})
      };
      if (await isPlayableStream(result)) return result;
    } catch (error) {
      console.log(`[111movies] ${source.key} resolution failed:`, error);
    }
  }
  return null;
}

export async function resolve111Movies(target: string): Promise<Stream | null> {
  return resolve111MoviesInternal(target);
}

export async function get111MoviesSourceOptions(target: string): Promise<StreamSourceOption[]> {
  const player = await getPlayerTarget(target);
  return player ? discoverSources(player.url) : [];
}

export async function resolve111MoviesSource(
  target: string,
  sourceKey: string
): Promise<Stream | null> {
  return resolve111MoviesInternal(target, sourceKey);
}
