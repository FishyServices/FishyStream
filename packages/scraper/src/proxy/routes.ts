import { Hono } from "hono";
import { fetchWithRetry } from "../providers/fetcher";
import { isHttpUrl } from "../providers/media";
import { rewritePlaylist } from "./playlist";
import type { ScrapeBindings, StreamHeaders } from "../types";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Expose-Headers": "*",
  "Cache-Control": "no-cache, no-store, must-revalidate"
};

function headers(value: string | undefined): StreamHeaders | Response {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return new Response("Invalid headers format", { status: 400 });
  }
}

function target(c: { req: { query: (name: string) => string | undefined } }): string | Response {
  const url = c.req.query("url");
  if (!url) return new Response("URL parameter is required", { status: 400 });
  if (!isHttpUrl(url)) return new Response("URL must use http: or https:", { status: 400 });
  return url;
}

async function upstreamError(label: string, url: string, response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  console.log(`[proxy] ${label} upstream ${response.status} for ${url.slice(0, 120)}`);
  console.log(`[proxy]   body: ${body.slice(0, 200)}`);
  return `Upstream returned ${response.status}`;
}

type PlaylistResult = { ok: true; body: string } | { ok: false; error: string };

const PLAYLIST_TTL_MS = 20_000;
const MAX_CONCURRENT_PLAYLISTS = 2;
const playlistCache = new Map<string, { result: Promise<PlaylistResult>; expires: number }>();
let activePlaylists = 0;
const playlistQueue: Array<() => void> = [];

async function withPlaylistSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activePlaylists >= MAX_CONCURRENT_PLAYLISTS) {
    await new Promise<void>((resolve) => playlistQueue.push(resolve));
  }
  activePlaylists += 1;
  try {
    return await task();
  } finally {
    activePlaylists -= 1;
    playlistQueue.shift()?.();
  }
}

async function limitedPlaylistFetch(
  url: string,
  requestHeaders: StreamHeaders,
  base: string
): Promise<PlaylistResult> {
  return withPlaylistSlot(async () => {
    const response = await fetchWithRetry(url, requestHeaders);
    if (!response.ok) return { ok: false, error: await upstreamError("m3u8", url, response) };
    const content = await response.text();
    return { ok: true, body: rewritePlaylist(content, response.url || url, base, requestHeaders) };
  });
}

function proxyBase(host: string | undefined): string {
  const value = host ?? "localhost:4000";
  return `${value.includes("localhost") ? "http" : "https"}://${value}`;
}

export function registerProxyRoutes(app: Hono<{ Bindings: ScrapeBindings }>): void {
  app.get("/api/m3u8-proxy", async (c) => {
    const value = target(c);
    if (value instanceof Response) return value;
    const parsed = headers(c.req.query("headers"));
    if (parsed instanceof Response) return parsed;
    const base = proxyBase(c.req.header("host"));
    const key = `${base}|${value}|${JSON.stringify(parsed)}`;
    const cached = playlistCache.get(key);
    let pending: Promise<PlaylistResult>;
    if (cached && cached.expires > Date.now()) {
      pending = cached.result;
    } else {
      pending = limitedPlaylistFetch(value, parsed, base);
      playlistCache.set(key, { result: pending, expires: Date.now() + PLAYLIST_TTL_MS });
      pending.then((result) => {
        if (!result.ok) playlistCache.delete(key);
      });
    }
    const result = await pending;
    if (!result.ok) return c.text(result.error, 502);
    return c.text(result.body, 200, {
      ...corsHeaders,
      "Content-Type": "application/vnd.apple.mpegurl"
    });
  });

  app.get("/api/media-proxy", async (c) => {
    const value = target(c);
    if (value instanceof Response) return value;
    const parsed = headers(c.req.query("headers"));
    if (parsed instanceof Response) return parsed;
    const range = c.req.header("range");
    const response = await fetchWithRetry(value, { ...parsed, ...(range ? { Range: range } : {}) });
    if (!response.ok && response.status !== 206)
      return c.text(await upstreamError("media", value, response), 502);
    const output = new Headers(corsHeaders);
    output.set("Content-Type", response.headers.get("content-type") ?? "video/mp4");
    for (const name of ["accept-ranges", "content-length", "content-range"]) {
      const header = response.headers.get(name);
      if (header) output.set(name, header);
    }
    if (c.req.query("download") === "1")
      output.set("Content-Disposition", `attachment; filename="fishystream-video.mp4"`);
    return new Response(response.body, { status: response.status, headers: output });
  });

  app.get("/api/ts-proxy", async (c) => {
    const value = target(c);
    if (value instanceof Response) return value;
    const parsed = headers(c.req.query("headers"));
    if (parsed instanceof Response) return parsed;
    const response = await fetchWithRetry(value, parsed);
    if (!response.ok) return c.text(await upstreamError("ts", value, response), 502);
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") ?? "video/mp2t"
      }
    });
  });

  app.get("/api/subtitle-proxy", async (c) => {
    const value = target(c);
    if (value instanceof Response) return value;
    const parsed = headers(c.req.query("headers"));
    if (parsed instanceof Response) return parsed;
    const response = await fetchWithRetry(value, parsed);
    if (!response.ok) return c.text(`Upstream returned ${response.status}`, 502);
    return new Response(response.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") ?? "text/vtt"
      }
    });
  });
}
