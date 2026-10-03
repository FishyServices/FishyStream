import { INSECURE_TLS } from "../../fetcher";
import { isHttpUrl, resolveMedia } from "../../media";
import type { Stream, StreamHeaders } from "../../../types";

const HOST = "vixsrc.to";
const ORIGIN = `https://${HOST}`;
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

type Request =
  | { id: string; type: "movie"; pageUrl: URL }
  | { id: string; type: "tv"; season: string; episode: string; pageUrl: URL };

type HttpText = { status: number; contentType: string; url: string; text: string };
type PlayerData = { playlistUrl: string; token: string; expires: string; servers: string[] };

const log = (...values: unknown[]) => console.log("[vixsrc]", ...values);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const pageUrl = new URL(target);
    if (pageUrl.protocol !== "https:" || pageUrl.hostname !== HOST || pageUrl.port) return null;
    const parts = pageUrl.pathname.split("/").filter(Boolean);
    const [type, id, season, episode] = parts;
    if (!id || !/^\d{1,10}$/.test(id)) return null;
    if (type === "movie" && parts.length === 2) return { id, type, pageUrl };
    if (
      type === "tv" &&
      parts.length === 4 &&
      season &&
      episode &&
      /^\d{1,4}$/.test(season) &&
      /^\d{1,4}$/.test(episode) &&
      Number(episode) > 0
    ) {
      return { id, type, season, episode, pageUrl };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchText(label: string, url: string, referer: string): Promise<HttpText | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        Origin: ORIGIN,
        Referer: referer
      },
      redirect: "follow",
      signal: controller.signal,
      ...INSECURE_TLS
    });
    const text = await response.text();
    log(
      `${label} GET ${url} -> ${response.status} (${response.headers.get("content-type") ?? ""}, ${Date.now() - started}ms)`
    );
    if (!response.ok) log("  response body:", text.slice(0, 180));
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "",
      url: response.url,
      text
    };
  } catch (error) {
    log(
      `${label} GET ${url} failed after ${Date.now() - started}ms:`,
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function apiUrl(request: Request): string {
  const path =
    request.type === "movie"
      ? `/api/movie/${request.id}`
      : `/api/tv/${request.id}/${request.season}/${request.episode}`;
  const url = new URL(path, ORIGIN);
  const language = request.pageUrl.searchParams.get("lang");
  if (language) url.searchParams.set("lang", language);
  return url.href;
}

function readEmbedUrl(value: unknown): URL | null {
  if (!isRecord(value) || typeof value.src !== "string") return null;
  try {
    const url = new URL(value.src, ORIGIN);
    return url.protocol === "https:" && url.hostname === HOST && url.pathname.startsWith("/embed/")
      ? url
      : null;
  } catch {
    return null;
  }
}

function readServerUrls(html: string): string[] {
  const assignment = html.match(/window\.streams\s*=\s*(\[[\s\S]*?\]);/);
  if (!assignment?.[1]) return [];
  try {
    const value: unknown = JSON.parse(assignment[1]);
    if (!Array.isArray(value)) return [];
    return value.flatMap((server) => {
      if (!isRecord(server) || typeof server.url !== "string") return [];
      try {
        const url = new URL(server.url, ORIGIN);
        return url.protocol === "https:" && url.hostname === HOST ? [url.href] : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function readPlayerData(html: string): PlayerData | null {
  const start = html.indexOf("window.masterPlaylist");
  if (start < 0) return null;
  const master = html.slice(start);
  const token = master.match(/(?:['"]token['"]|\btoken)\s*:\s*['"]([^'"]+)['"]/i)?.[1];
  const expires = master.match(/(?:['"]expires['"]|\bexpires)\s*:\s*['"]?(\d+)['"]?/i)?.[1];
  const rawPlaylistUrl = master.match(/\n\s*url\s*:\s*['"]([^'"]+)['"]/i)?.[1];
  if (!token || !expires || !rawPlaylistUrl) return null;
  try {
    const url = new URL(rawPlaylistUrl, ORIGIN);
    if (
      url.protocol !== "https:" ||
      url.hostname !== HOST ||
      !url.pathname.startsWith("/playlist/")
    )
      return null;
    const servers = readServerUrls(html);
    if (!servers.includes(url.href)) servers.push(url.href);
    return { playlistUrl: url.href, token, expires, servers };
  } catch {
    return null;
  }
}

function playlistUrls(data: PlayerData, language: string): string[] {
  const seen = new Set<string>();
  return data.servers.flatMap((serverUrl) => {
    try {
      const url = new URL(serverUrl);
      url.searchParams.set("token", data.token);
      url.searchParams.set("expires", data.expires);
      url.searchParams.set("h", "1");
      url.searchParams.set("lang", language);
      if (seen.has(url.href)) return [];
      seen.add(url.href);
      return [url.href];
    } catch {
      return [];
    }
  });
}

async function verifyPlaylist(url: string, headers: StreamHeaders): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
      ...INSECURE_TLS
    });
    const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
    const valid = response.ok && body.startsWith("#EXTM3U");
    log(`HLS probe ${response.status}: ${valid ? "valid playlist" : body.slice(0, 120)}`);
    return valid;
  } catch (error) {
    log("HLS probe failed:", error instanceof Error ? error.message : error);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolve(request: Request): Promise<Stream | null> {
  log(
    `resolving ${request.type} ${request.id}${request.type === "tv" ? ` S${request.season}E${request.episode}` : ""}`
  );
  const apiResponse = await fetchText("API", apiUrl(request), request.pageUrl.href);
  if (!apiResponse) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(apiResponse.text) as unknown;
  } catch {
    log("API response was not JSON:", apiResponse.text.slice(0, 180));
    return null;
  }

  const embedUrl = readEmbedUrl(payload);
  if (!embedUrl) {
    log("API response did not contain a VixSrc embed URL");
    return null;
  }
  const embedResponse = await fetchText("embed", embedUrl.href, request.pageUrl.href);
  if (!embedResponse) return null;
  const playerData = readPlayerData(embedResponse.text);
  if (!playerData) {
    log("embed page did not contain master playlist credentials");
    return null;
  }

  const headers: StreamHeaders = {
    "User-Agent": USER_AGENT,
    Origin: ORIGIN,
    Referer: embedUrl.href
  };
  const language =
    embedUrl.searchParams.get("lang") || request.pageUrl.searchParams.get("lang") || "en";
  for (const url of playlistUrls(playerData, language)) {
    const stream = resolveMedia(url, embedUrl.href, "hls");
    if (!stream || !isHttpUrl(stream.url)) continue;
    const candidate = { ...stream, headers };
    if (await verifyPlaylist(candidate.url, headers)) return candidate;
  }
  log("no verified playlist found on any VixSrc server");
  return null;
}

export async function resolveVixSrc(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) return null;
  try {
    return await resolve(request);
  } catch (error) {
    log("resolver failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
