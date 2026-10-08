import { resolveMedia } from "../media";
import { INSECURE_TLS } from "../fetcher";
import type { Stream } from "../../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8_000;

type Request = { origin: string; apiUrl: URL };

function getRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.hostname !== "vidzen.fun") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [kind, id, season, episode] = parts;
    if ((kind !== "movie" && kind !== "tv") || !id || !/^\d+$/.test(id)) return null;
    const apiUrl = new URL("/api/sources", url.origin);
    apiUrl.searchParams.set("type", kind);
    apiUrl.searchParams.set("id", id);
    if (kind === "tv") {
      if (!season || !episode || !/^\d+$/.test(season) || !/^\d+$/.test(episode)) return null;
      apiUrl.searchParams.set("season", season);
      apiUrl.searchParams.set("episode", episode);
    } else if (parts.length !== 2) {
      return null;
    }
    return { origin: url.origin, apiUrl };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function streamFrom(payload: unknown, origin: string): Stream | null {
  if (!isRecord(payload) || !Array.isArray(payload.sources)) return null;
  for (const source of payload.sources) {
    if (!isRecord(source) || typeof source.url !== "string") continue;
    const stream = resolveMedia(source.url, origin, source.type);
    if (!stream) continue;
    return {
      ...stream,
      headers: {
        "User-Agent": USER_AGENT,
        Referer: `${origin}/`,
        Origin: origin
      }
    };
  }
  return null;
}

export async function resolveVidZen(target: string): Promise<Stream | null> {
  const request = getRequest(target);
  if (!request) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(request.apiUrl, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Referer: `${request.origin}/`,
        Origin: request.origin
      },
      signal: controller.signal,
      ...INSECURE_TLS
    });
    const payload: unknown = await response.json().catch(() => null);
    return streamFrom(payload, request.origin);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
