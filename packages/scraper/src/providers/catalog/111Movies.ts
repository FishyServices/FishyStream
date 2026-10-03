import { INSECURE_TLS } from "../fetcher";
import { resolveVidLove } from "./vidLove";
import type { Stream } from "../../types";

const HOST = "111movies.net";
const PLAYER_HOST = "player.vidlove.cc";
const PLAYER_ORIGIN = `https://${PLAYER_HOST}`;
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;

type Request =
  { id: string; type: "movie" } | { id: string; type: "tv"; season: string; episode: string };

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

async function verifyMedia(stream: Stream): Promise<boolean> {
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
      const valid = response.ok && body.startsWith("#EXTM3U");
      console.log(
        `[111movies] HLS probe ${response.status}: ${valid ? "valid playlist" : body.slice(0, 120)}`
      );
      return valid;
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    const valid =
      (response.status === 200 || response.status === 206) &&
      !/text\/|html|json|xml/.test(contentType);
    console.log(
      `[111movies] file probe ${response.status} ${contentType}: ${valid ? "valid file" : "rejected"}`
    );
    return valid;
  } catch (error) {
    console.log(`[111movies] media probe failed:`, error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolve111Movies(target: string): Promise<Stream | null> {
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
  const playerPath =
    request.type === "movie"
      ? `/embed/movie/${tmdbId}`
      : `/embed/tv/${tmdbId}/${request.season}/${request.episode}`;
  const stream = await resolveVidLove(`${PLAYER_ORIGIN}${playerPath}`);
  if (!stream || !(await verifyMedia(stream))) return null;
  return stream;
}
