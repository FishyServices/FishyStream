// DOES NOT WORK
import { fetchWithRetry } from "../fetcher";
import { resolveMedia } from "../media";
import type { Stream } from "../../types";

const HOST = "vidzen.fun";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const log = (...args: unknown[]) => console.log("[vidzen]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 400);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): { origin: string; apiUrl: string } | null {
  try {
    const url = new URL(target);
    const [kind, id, season, episode] = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== HOST || !id || (kind !== "movie" && kind !== "tv")) return null;
    const api = new URL("/api/sources", url.origin);
    api.searchParams.set("type", kind);
    api.searchParams.set("id", id);
    if (kind === "tv") {
      if (!season || !episode) return null;
      api.searchParams.set("season", season);
      api.searchParams.set("episode", episode);
    }
    return { origin: url.origin, apiUrl: api.href };
  } catch {
    return null;
  }
}

// sources are sometimes wrapped in a proxy like https://x/proxy?url=<real m3u8>; unwrap it.
function unwrapProxy(value: string, origin: string): string {
  try {
    const url = new URL(value, origin);
    for (const key of ["url", "u", "link", "src"]) {
      const inner = url.searchParams.get(key);
      if (inner && /^https?:\/\//i.test(inner) && /\.(?:m3u8|mp4|webm)(?:[?#]|$)/i.test(inner))
        return inner;
    }
  } catch {}
  return value;
}

export async function resolveVidZen(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse request from", target);
    return null;
  }
  log("request:", request.apiUrl);

  const started = Date.now();
  let payload: unknown;
  try {
    const response = await fetchWithRetry(request.apiUrl, {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Referer: `${request.origin}/`
    });
    log(`GET ${request.apiUrl} -> ${response.status} (${Date.now() - started}ms)`);
    const text = await response.text();
    if (!response.ok) {
      log("  body:", preview(text));
      return null;
    }
    log("  raw payload:", preview(text));
    payload = JSON.parse(text);
  } catch (error) {
    log("request failed:", error);
    return null;
  }

  if (!isRecord(payload) || !Array.isArray(payload.sources)) {
    log("  payload has no sources array");
    return null;
  }

  for (const source of payload.sources) {
    if (!isRecord(source) || typeof source.url !== "string") continue;
    const stream = resolveMedia(
      unwrapProxy(source.url, request.origin),
      request.origin,
      source.type
    );
    if (!stream) {
      log("  skipping unrecognised source:", preview(source));
      continue;
    }
    log(`FOUND ${stream.mediaType} stream:`, stream.url);
    return { ...stream, headers: { Referer: `${request.origin}/` } };
  }
  log("no playable source in", payload.sources.length, "sources");
  return null;
}
