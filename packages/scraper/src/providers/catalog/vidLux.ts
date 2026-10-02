// DOES NOT WORK
import { INSECURE_TLS } from "../fetcher";
import { resolveMedia, unwrapProxyData } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const REFERER = "https://vidlux.xyz/";
const TIMEOUT_MS = 10_000;
const SCRIPT_TIMEOUT_MS = 5_000;
const ENCRYPTION_SECRET = "vidlux-stream-encryption-2026-secure-key";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const log = (...args: unknown[]) => console.log("[vidlux]", ...args);

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (text ?? "undefined").slice(0, 300);
}

type Request =
  | { id: string; type: "movie" }
  | { id: string; type: "tv"; season: string | undefined; episode: string | undefined };

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    const match = url.pathname.match(/\/embed\/(movie|tv)\/([^/]+)/i);
    const type = match?.[1]?.toLowerCase();
    const id = match?.[2];
    if (!id || (type !== "movie" && type !== "tv")) return null;
    if (type === "movie") return { id, type };
    const parts = url.pathname.split("/").filter(Boolean);
    return { id, type, season: parts[3], episode: parts[4] };
  } catch {
    return null;
  }
}

function extractToken(html: string): string | null {
  return (
    html.match(/requestToken\\":\\"([^\\"]+)/i)?.[1] ??
    html.match(/requestToken\s*[:=]\s*["']([^"']+)["']/i)?.[1] ??
    null
  );
}

function extractScriptUrls(html: string, origin: string): string[] {
  return [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].flatMap((match) => {
    const source = match[1];
    if (!source) return [];
    try {
      return [new URL(source, origin).href];
    } catch {
      return [];
    }
  });
}

function extractProviderArrays(script: string): string[][] {
  return [...script.matchAll(/=\[((?:"[a-z0-9_-]+"\s*,?){3,})\]/gi)].flatMap((match) => {
    const valuesText = match[1];
    if (!valuesText) return [];
    try {
      const values: unknown = JSON.parse(`[${valuesText.replace(/,\s*$/, "")}]`);
      if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) return [];
      const names = values as string[];
      return names.length >= 5 && names.every((name) => /^[a-z]{4,}$/.test(name)) ? [names] : [];
    } catch {
      return [];
    }
  });
}

async function fetchTimed(
  url: string,
  headers: StreamHeaders,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers, signal: controller.signal, ...INSECURE_TLS });
  } catch (error) {
    log(`GET ${url.slice(0, 150)} failed:`, error instanceof Error ? error.message : error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function discoverProviderIds(
  html: string,
  origin: string,
  referrer: string
): Promise<string[]> {
  const scriptUrls = extractScriptUrls(html, origin);
  log(`found ${scriptUrls.length} scripts to scan for provider ids`);
  const scripts = await Promise.all(
    scriptUrls.map(async (url) => {
      const response = await fetchTimed(
        url,
        { "User-Agent": USER_AGENT, Accept: "*/*", Referer: referrer, Origin: origin },
        SCRIPT_TIMEOUT_MS
      );
      return response?.ok ? await response.text() : "";
    })
  );
  const arrays = scripts.flatMap(extractProviderArrays);
  const best = arrays.sort((left, right) => right.length - left.length)[0];
  return best ? [...new Set(best)] : [];
}

function unwrapDownloadUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.pathname === "/api/download" ? (url.searchParams.get("url") ?? value) : value;
  } catch {
    return value;
  }
}

async function decryptPayload(value: string): Promise<unknown> {
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ENCRYPTION_SECRET));
  const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12)
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function resolveProvider(
  provider: string,
  request: Request,
  token: string,
  origin: string,
  target: string
): Promise<Stream | null> {
  try {
    const endpoint = new URL(`/api/extract/${provider}`, origin);
    endpoint.searchParams.set("id", request.id);
    endpoint.searchParams.set("type", request.type);
    endpoint.searchParams.set("_t", token);
    if (request.type === "tv" && request.season && request.episode) {
      endpoint.searchParams.set("season", request.season);
      endpoint.searchParams.set("episode", request.episode);
    }
    const started = Date.now();
    const response = await fetchTimed(
      endpoint.href,
      {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        Origin: origin,
        Referer: target
      },
      TIMEOUT_MS
    );
    if (!response) return null;
    log(`${provider} -> ${response.status} (${Date.now() - started}ms)`);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      log(
        `  ${provider} body:`,
        /^\s*<(?:!doctype|html)/i.test(body) ? "(html page)" : preview(body)
      );
      return null;
    }
    const payload = (await response.json()) as { encrypted?: boolean; data?: string };
    const decoded: unknown =
      payload.encrypted && payload.data ? await decryptPayload(payload.data) : payload;
    if (!decoded || typeof decoded !== "object") return null;
    const { streams, captions } = decoded as { streams?: unknown; captions?: unknown };
    if (!Array.isArray(streams)) {
      log(`  ${provider}: no streams array in`, preview(decoded));
      return null;
    }
    for (const entry of streams) {
      if (!entry || typeof entry !== "object") continue;
      const { file, type } = entry as { file?: unknown; type?: unknown };
      if (typeof file !== "string") continue;
      const direct = unwrapDownloadUrl(file);
      const wrapped = unwrapProxyData(direct);
      if (wrapped)
        log(`  ${provider}: unwrapped proxy ->`, wrapped.url, JSON.stringify(wrapped.headers));
      const stream = resolveMedia(wrapped?.url ?? direct, origin, type);
      if (!stream) continue;
      log(`  ${provider}: found ${stream.mediaType}`, stream.url);
      return {
        ...stream,
        headers: wrapped ? wrapped.headers : { Referer: REFERER },
        ...(captions ? { tracks: captions } : {})
      };
    }
    log(`  ${provider}: no playable stream in`, preview(streams));
  } catch (error) {
    log(`${provider} threw:`, error);
  }
  return null;
}

export async function resolveVidLux(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) {
    log("could not parse request from", target);
    return null;
  }
  log("request:", JSON.stringify(request));

  const page = await fetchTimed(
    target,
    { "User-Agent": USER_AGENT, Accept: "text/html,*/*", Referer: REFERER },
    TIMEOUT_MS
  );
  if (!page) return null;
  log(`embed page -> ${page.status}`);
  if (!page.ok) {
    log("  body:", preview(await page.text().catch(() => "")));
    return null;
  }
  const html = await page.text();
  const token = extractToken(html);
  if (!token) {
    log("no requestToken found in page:", preview(html));
    return null;
  }
  log("got request token");

  const origin = new URL(target).origin;
  const providerIds = await discoverProviderIds(html, origin, target);
  if (providerIds.length === 0) {
    log("no provider ids found in page scripts");
    return null;
  }
  log("providers:", providerIds.join(", "));

  const results = await Promise.all(
    providerIds.map((provider) => resolveProvider(provider, request, token, origin, target))
  );
  const stream = results.find((result): result is Stream => result !== null) ?? null;
  if (stream) log(`FOUND ${stream.mediaType} stream:`, stream.url);
  else log("all providers exhausted");
  return stream;
}
