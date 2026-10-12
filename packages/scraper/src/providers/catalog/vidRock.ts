import { fetchProvider, INSECURE_TLS, isPlayableStream } from "../fetcher";
import { resolveMedia } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const HOSTS = new Set(["vidrock.ru", "vidrock.to", "vidrock.net"]);
const TMDB_API = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const log = (...args: unknown[]) => console.log("[vidrock]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 300);
}

function endpointName(value: string): string {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchJson(
  url: string,
  headers: StreamHeaders,
  label: string
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const response = await fetch(url, { headers, signal: controller.signal, ...INSECURE_TLS });
    log(`${label} GET ${endpointName(url)} -> ${response.status} (${Date.now() - started}ms)`);
    const text = await response.text();
    if (!response.ok) {
      log("  body:", preview(text));
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      log("  response was not JSON:", preview(text));
      return null;
    }
  } catch (error) {
    log(`${label} GET ${endpointName(url)} threw after ${Date.now() - started}ms:`, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveTmdbId(id: string, type: "movie" | "tv"): Promise<string | null> {
  if (!/^tt\d+$/i.test(id)) return id;
  const value = await fetchJson(
    `${TMDB_API}/find/${encodeURIComponent(id)}?api_key=${TMDB_API_KEY}&external_source=imdb_id`,
    { "User-Agent": USER_AGENT, Accept: "application/json" },
    "tmdb find"
  );
  if (!isRecord(value)) return null;
  const results = value[type === "movie" ? "movie_results" : "tv_results"];
  if (!Array.isArray(results)) return null;
  const match = results.find((entry) => isRecord(entry) && typeof entry.id === "number");
  return isRecord(match) && typeof match.id === "number" ? String(match.id) : null;
}

function decodeHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  try {
    const normalized = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

async function decryptSource(value: string, keyHex: string): Promise<string | null> {
  const encrypted = decodeBase64Url(value);
  if (encrypted.length < 28) {
    log("  encrypted value too short / not base64url:", { characters: value.length });
    return null;
  }
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      decodeHex(keyHex),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: encrypted.slice(0, 12) },
      key,
      encrypted.slice(12)
    );
    return new TextDecoder().decode(plaintext);
  } catch (error) {
    log("  AES-GCM decrypt failed (key may have changed):", error);
    return null;
  }
}

async function readPlayerKey(url: URL): Promise<string | null> {
  try {
    const page = await fetchProvider(url.href);
    if (!page.ok) {
      log(`player HTML returned HTTP ${page.status}`);
      return null;
    }
    const html = await page.text();
    const scriptPath = html.match(
      /<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i
    )?.[1];
    if (!scriptPath) {
      log("player HTML did not contain its module bundle");
      return null;
    }
    const scriptUrl = new URL(scriptPath, url).href;
    const response = await fetchProvider(scriptUrl, { Referer: `${url.origin}/` });
    if (!response.ok) {
      log(`player JavaScript returned HTTP ${response.status}`);
      return null;
    }
    const source = await response.text();
    const key = source.match(/(?:TQ|KEY_HEX)=["']([a-f\d]{64})["']/i)?.[1];
    if (key) log(`read AES-GCM key from ${new URL(scriptUrl).pathname}`);
    else log("player JavaScript did not contain a recognized AES-GCM key");
    return key ?? null;
  } catch (error) {
    log("could not read player HTML/JavaScript:", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function resolveVidRock(target: string): Promise<Stream | null> {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    log("invalid url", target);
    return null;
  }
  const [root, type, id, season, episode] = url.pathname.split("/").filter(Boolean);
  if (!HOSTS.has(url.hostname) || root !== "embed" || !id || (type !== "movie" && type !== "tv")) {
    log("could not parse request from", target);
    return null;
  }
  if (type === "tv" && (!season || !episode)) {
    log("tv url missing season/episode");
    return null;
  }

  const keyHex = await readPlayerKey(url);
  if (!keyHex) return null;

  const tmdbId = await resolveTmdbId(id, type);
  if (!tmdbId) {
    log("could not resolve TMDB id for", id);
    return null;
  }
  const apiUrl =
    type === "movie"
      ? `${url.origin}/api/movie/${encodeURIComponent(tmdbId)}`
      : `${url.origin}/api/tv/${encodeURIComponent(tmdbId)}/${encodeURIComponent(season ?? "")}/${encodeURIComponent(episode ?? "")}`;
  const origin = url.origin;

  const payload = await fetchJson(
    apiUrl,
    {
      "User-Agent": USER_AGENT,
      Accept: "application/json, text/plain, */*",
      Origin: url.origin,
      Referer: `${url.origin}/`
    },
    "sources"
  );
  if (!isRecord(payload)) {
    log("  payload is not an object:", preview(payload));
    return null;
  }
  log("  source entries:", Object.keys(payload).length);

  const headers: StreamHeaders = {
    "User-Agent": USER_AGENT,
    Origin: url.origin,
    Referer: `${url.origin}/`
  };
  const seenUrls = new Set<string>();
  for (const [name, source] of Object.entries(payload)) {
    if (!isRecord(source) || typeof source.url !== "string") continue;
    const decrypted = await decryptSource(source.url, keyHex);
    const stream = resolveMedia(decrypted, origin, source.type);
    if (!stream || seenUrls.has(stream.url)) continue;
    seenUrls.add(stream.url);
    if (/\/(?:demo-video|sample-video)\.mp4(?:[?#]|$)/i.test(stream.url)) continue;
    if (stream.mediaType === "hls") {
      const playlist = await playlistDuration(stream.url, headers, name);
      if (!playlist.valid) {
        log(`  ${name}: playlist request did not return valid HLS`);
        continue;
      }
      if (playlist.duration !== null && playlist.duration < MIN_DURATION_SECONDS) {
        log(
          `  ${name}: only ${Math.round(playlist.duration)}s long, looks like a placeholder, skipping`
        );
        continue;
      }
    } else if (!(await isPlayableStream(stream))) {
      log(`  ${name}: decrypted candidate failed playback probe`);
      continue;
    }
    log(`FOUND ${stream.mediaType} stream via "${name}" on ${new URL(stream.url).hostname}`);
    return { ...stream, headers };
  }
  log("no playable source found");
  return null;
}

const MIN_DURATION_SECONDS = 120;

async function playlistDuration(
  url: string,
  headers: StreamHeaders,
  name: string,
  depth = 0
): Promise<{ valid: boolean; duration: number | null }> {
  try {
    const response = await fetch(url, { headers, ...INSECURE_TLS });
    const text = await response.text();
    log(
      `  ${name} playlist ${response.status} ${response.headers.get("content-type") ?? ""}:`,
      preview(text)
    );
    if (!response.ok || !text.includes("#EXTM3U")) return { valid: false, duration: null };
    if (text.includes("#EXT-X-STREAM-INF") && depth < 1) {
      const variant = text.split(/\r?\n/).find((line) => line && !line.startsWith("#"));
      return variant
        ? playlistDuration(new URL(variant, url).href, headers, name, depth + 1)
        : { valid: false, duration: null };
    }
    const total = [...text.matchAll(/#EXTINF:([\d.]+)/g)].reduce(
      (sum, match) => sum + Number(match[1]),
      0
    );
    log(`  ${name} total duration: ${Math.round(total)}s`);
    return { valid: true, duration: total > 0 ? total : null };
  } catch (error) {
    log(`  ${name} playlist check threw:`, error);
    return { valid: false, duration: null };
  }
}
