import { INSECURE_TLS } from "../../fetcher";
import type { Stream } from "../../../types";

const VAPLAYER_API = "https://streamdata.vaplayer.ru/api.php";
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const TIMEOUT_MS = 12_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const VIDFAST_HOSTS = new Set([
  "vidfast.pro",
  "vidfast.in",
  "vidfast.io",
  "vidfast.me",
  "vidfast.net",
  "vidfast.pm",
  "vidfast.vc",
  "vidfast.bz",
  "vidfast.xyz"
]);

type Request =
  { kind: "movie"; id: string } | { kind: "tv"; id: string; season: string; episode: string };

function log(stage: string, details: Record<string, string | number | boolean | null>): void {
  console.log(`[vidfast] ${JSON.stringify({ stage, ...details })}`);
}

function endpointName(value: string): string {
  const url = new URL(value);
  return `${url.hostname}${url.pathname}`;
}

function errorDetails(error: unknown): Record<string, string> {
  if (typeof error !== "object" || error === null) return { error: "unknown" };
  const value = error as { name?: unknown; code?: unknown };
  return {
    errorName: typeof value.name === "string" ? value.name : "Error",
    ...(typeof value.code === "string" ? { errorCode: value.code } : {})
  };
}

function getRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (!VIDFAST_HOSTS.has(url.hostname)) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [kind, id, season, episode] = parts;
    if (!id || !/^(?:\d{1,10}|tt\d{5,12})$/i.test(id)) return null;
    if (kind === "movie" && parts.length === 2) return { kind, id };
    if (
      kind === "tv" &&
      parts.length === 4 &&
      season &&
      episode &&
      /^\d{1,4}$/.test(season) &&
      /^\d{1,4}$/.test(episode)
    ) {
      return { kind, id, season, episode };
    }
    return null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchText(
  url: string,
  referer: string,
  stage: string,
  navigation = false
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: navigation
        ? "text/html,application/xhtml+xml"
        : "text/html,application/xhtml+xml,application/json,*/*",
      Referer: referer
    };
    if (navigation) {
      headers.Origin = new URL(url).origin;
    } else {
      headers.Origin = new URL(referer).origin;
    }
    let requestUrl = url;
    let response: Response;
    for (let redirects = 0; ; redirects += 1) {
      const requestHeaders = navigation
        ? {
            ...headers,
            Referer: requestUrl,
            Origin: new URL(requestUrl).origin
          }
        : headers;
      response = await fetch(requestUrl, {
        headers: requestHeaders,
        redirect: navigation ? "manual" : "follow",
        signal: controller.signal,
        ...INSECURE_TLS
      });
      const location = response.headers.get("location");
      if (
        !navigation ||
        !location ||
        ![301, 302, 303, 307, 308].includes(response.status) ||
        redirects >= 4
      ) {
        break;
      }
      const nextUrl = new URL(location, requestUrl);
      if (nextUrl.protocol !== "https:" || !VIDFAST_HOSTS.has(nextUrl.hostname)) break;
      await response.body?.cancel().catch(() => undefined);
      requestUrl = nextUrl.href;
    }
    const text = await response.text();
    log(stage, {
      endpoint: endpointName(url),
      finalEndpoint: endpointName(requestUrl),
      status: response.status,
      ok: response.ok,
      bytes: text.length,
      ...(response.status === 403
        ? {
            server: response.headers.get("server"),
            contentType: response.headers.get("content-type"),
            challenge: response.headers.get("cf-mitigated") === "challenge"
          }
        : {})
    });
    return response.ok ? text : null;
  } catch (error) {
    log(stage, { endpoint: endpointName(url), ok: false, ...errorDetails(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveTmdbId(id: string, kind: Request["kind"]): Promise<string | null> {
  if (!id.toLowerCase().startsWith("tt")) return id;
  const url = new URL(`/find/${encodeURIComponent(id)}`, TMDB_API);
  url.searchParams.set("api_key", TMDB_API_KEY);
  url.searchParams.set("external_source", "imdb_id");
  const text = await fetchText(url.href, `${TMDB_API}/`, "tmdb_lookup");
  if (!text) return null;
  try {
    const payload: unknown = JSON.parse(text);
    if (!isRecord(payload)) {
      log("tmdb_lookup", { ok: false, reason: "invalid_response" });
      return null;
    }
    const results = kind === "movie" ? payload.movie_results : payload.tv_results;
    if (!Array.isArray(results) || !isRecord(results[0])) {
      log("tmdb_lookup", { ok: false, reason: "no_matching_title", kind });
      return null;
    }
    const tmdbId = results[0].id;
    if (typeof tmdbId !== "number" && typeof tmdbId !== "string") {
      log("tmdb_lookup", { ok: false, reason: "missing_id", kind });
      return null;
    }
    log("tmdb_lookup", { ok: true, kind });
    return String(tmdbId);
  } catch {
    log("tmdb_lookup", { ok: false, reason: "invalid_json" });
    return null;
  }
}

async function resolveVidFast(target: string): Promise<Stream | null> {
  const request = getRequest(target);
  if (!request) {
    log("input", { ok: false, reason: "unsupported_url" });
    return null;
  }

  const pageUrl = new URL(target);
  pageUrl.pathname =
    request.kind === "movie"
      ? `/movie/${encodeURIComponent(request.id)}`
      : `/tv/${encodeURIComponent(request.id)}/${request.season}/${request.episode}`;
  pageUrl.search = "";
  pageUrl.hash = "";
  const page = await fetchText(pageUrl.href, pageUrl.href, "player_page", true);
  const token = page?.match(/"en":"([^"]+)"/)?.[1];
  if (!token) {
    log("token_extract", { ok: false, reason: page ? "token_not_found" : "page_request_failed" });
    return null;
  }
  log("token_extract", { ok: true });

  const tmdbId = await resolveTmdbId(request.id, request.kind);
  if (!tmdbId) {
    log("tmdb_id", { ok: false, kind: request.kind });
    return null;
  }

  const apiUrl = new URL(VAPLAYER_API);
  apiUrl.searchParams.set("type", request.kind);
  apiUrl.searchParams.set("tmdb", tmdbId);
  apiUrl.searchParams.set("source", "auto");
  apiUrl.searchParams.set("token", token);
  apiUrl.searchParams.set("ts", String(Math.floor(Date.now() / 1000)));
  if (request.kind === "tv") {
    apiUrl.searchParams.set("season", request.season);
    apiUrl.searchParams.set("episode", request.episode);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, */*",
        Referer: pageUrl.href,
        Origin: pageUrl.origin
      },
      signal: controller.signal,
      ...INSECURE_TLS
    });
    if (!response.ok) {
      log("stream_api", { ok: false, status: response.status });
      return null;
    }
    const payload: unknown = await response.json().catch(() => null);
    if (
      !isRecord(payload) ||
      String(payload.status_code) !== "200" ||
      !isRecord(payload.data) ||
      !Array.isArray(payload.data.stream_urls)
    ) {
      log("stream_api", {
        ok: false,
        reason: "unexpected_response",
        hasPayload: isRecord(payload),
        statusCode:
          isRecord(payload) && payload.status_code != null ? String(payload.status_code) : null
      });
      return null;
    }

    log("stream_api", { ok: true, streamCount: payload.data.stream_urls.length });
    for (const value of payload.data.stream_urls) {
      if (typeof value !== "string") continue;
      let streamUrl: URL;
      try {
        streamUrl = new URL(value);
      } catch {
        continue;
      }
      if (streamUrl.protocol !== "https:") continue;
      log("stream_selected", { ok: true, host: streamUrl.hostname, mediaType: "hls" });
      return {
        url: streamUrl.href,
        mediaType: "hls",
        headers: {
          "User-Agent": USER_AGENT,
          Referer: `${pageUrl.origin}/`,
          Origin: pageUrl.origin
        }
      };
    }
    log("stream_selected", { ok: false, reason: "no_https_stream_url" });
    return null;
  } catch (error) {
    log("stream_api", { ok: false, ...errorDetails(error) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export { resolveVidFast };
