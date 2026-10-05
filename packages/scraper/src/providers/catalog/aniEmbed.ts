import { INSECURE_TLS } from "../fetcher";
import { isHttpUrl, originHeaders, resolveMedia } from "../media";
import type { Stream, StreamHeaders } from "../../types";

const ANIEMBED_ORIGIN = "https://aniembed.se";
const SOURCE_API = "https://pp.animex.one/rest/api/sources";
const TIMEOUT_MS = 10_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type Request = {
  url: URL;
  anilistId: string;
  episode: string;
  language: "sub" | "dub";
};

type Bootstrap = {
  id: string;
  providerIds: string[];
};

type TextResponse = {
  response: Response;
  text: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(target: string): Request | null {
  try {
    const url = new URL(target);
    if (url.protocol !== "https:" || url.hostname !== "aniembed.se" || url.port) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const [root, anilistId, episode] = parts;
    const language = url.searchParams.get("lang") ?? "sub";
    if (
      parts.length !== 3 ||
      root !== "e" ||
      !anilistId ||
      !/^\d+$/.test(anilistId) ||
      !episode ||
      !/^\d+$/.test(episode) ||
      (language !== "sub" && language !== "dub")
    ) {
      return null;
    }
    return { url, anilistId, episode, language };
  } catch {
    return null;
  }
}

function requestHeaders(url: string, accept: string, extra: StreamHeaders = {}): Headers {
  const headers = new Headers({ "User-Agent": USER_AGENT, Accept: accept });
  for (const [name, value] of Object.entries(extra)) headers.set(name, value);
  if (!headers.has("Referer")) {
    try {
      headers.set("Referer", `${new URL(url).origin}/`);
    } catch {}
  }
  return headers;
}

async function fetchText(
  url: string,
  accept: string,
  headers: StreamHeaders = {}
): Promise<TextResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: requestHeaders(url, accept, headers),
      redirect: "follow",
      signal: controller.signal,
      ...INSECURE_TLS
    });
    return { response, text: await response.text() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseBootstrap(html: string, request: Request): Bootstrap | null {
  const data = html.match(/data:\s*\[null,\{type:"data",data:\{([\s\S]*?)\},uses:/)?.[1];
  if (!data) return null;

  const title = data.match(/\bid:"([^"\\]+)",anilistId:(\d+),/);
  const id = title?.[1];
  const episode = data.match(/\bepNum:(\d+)/)?.[1];
  const language = data.match(/\blang:"(sub|dub)"/)?.[1];
  if (
    !id ||
    !/^[a-z0-9][a-z0-9-]*$/i.test(id) ||
    title[2] !== request.anilistId ||
    episode !== request.episode ||
    language !== request.language
  ) {
    return null;
  }

  const providers = data.match(new RegExp(`\\b${request.language}Providers:\\[([^\\]]*)\\]`))?.[1];
  if (!providers) return null;
  const providerIds = [...providers.matchAll(/\bid:"([a-z0-9_-]+)"/gi)].flatMap((match) =>
    match[1] ? [match[1]] : []
  );
  const uniqueProviderIds = [...new Set(providerIds)];
  if (uniqueProviderIds.length === 0) return null;

  const selectedProvider =
    data.match(/\bproviderId:(null|"([a-z0-9_-]+)")/)?.[2] ?? request.url.searchParams.get("s");
  if (selectedProvider && uniqueProviderIds.includes(selectedProvider)) {
    return {
      id,
      providerIds: [selectedProvider, ...uniqueProviderIds.filter((id) => id !== selectedProvider)]
    };
  }
  return { id, providerIds: uniqueProviderIds };
}

function readHeaders(value: unknown): StreamHeaders {
  if (!isRecord(value)) return {};
  const headers = new Headers();
  for (const [name, entry] of Object.entries(value)) {
    if (
      typeof entry !== "string" ||
      !/^[a-z0-9-]+$/i.test(name) ||
      /^(accept|connection|content-length|host|transfer-encoding)$/i.test(name)
    ) {
      continue;
    }
    try {
      headers.set(name, entry);
    } catch {}
  }
  return Object.fromEntries(headers.entries());
}

function readTracks(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const tracks: unknown[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const candidate = typeof item.url === "string" ? item.url : item.file;
    if (typeof candidate !== "string") continue;
    let file: string;
    try {
      file = new URL(candidate, SOURCE_API).href;
    } catch {
      continue;
    }
    if (!isHttpUrl(file) || seen.has(file)) continue;
    seen.add(file);
    const label =
      typeof item.label === "string"
        ? item.label
        : typeof item.lang === "string"
          ? item.lang
          : undefined;
    tracks.push({ file, ...(label ? { label } : {}) });
  }
  return tracks.length > 0 ? tracks : undefined;
}

async function probeMedia(stream: Stream): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const headers = { ...stream.headers };
  if (stream.mediaType === "file") headers.Range = "bytes=0-1023";
  try {
    const init: RequestInit = {
      headers: requestHeaders(stream.url, "text/html,application/json,*/*", headers),
      redirect: "follow",
      signal: controller.signal,
      ...INSECURE_TLS
    };
    let response = await fetch(stream.url, init);
    if ([401, 403, 404].includes(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      response = await fetch(stream.url, {
        ...init,
        headers: requestHeaders(stream.url, "text/html,application/json,*/*", {
          ...headers,
          ...originHeaders(stream.url)
        })
      });
    }
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "");
      return response.ok && body.startsWith("#EXTM3U");
    }
    const contentType = response.headers.get("content-type") ?? "";
    const valid =
      (response.status === 200 || response.status === 206) &&
      !/^text\/|html|json|xml/i.test(contentType);
    await response.body?.cancel().catch(() => undefined);
    return valid;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function resolveSource(
  request: Request,
  id: string,
  providerId: string
): Promise<Stream | null> {
  const apiUrl = new URL(SOURCE_API);
  apiUrl.searchParams.set("id", id);
  apiUrl.searchParams.set("epNum", request.episode);
  apiUrl.searchParams.set("type", request.language);
  apiUrl.searchParams.set("providerId", providerId);

  const result = await fetchText(apiUrl.href, "application/json, text/plain, */*", {
    Origin: ANIEMBED_ORIGIN,
    Referer: request.url.href
  });
  if (!result?.response.ok) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(result.text);
  } catch {
    return null;
  }
  if (!isRecord(payload) || !Array.isArray(payload.sources)) return null;

  const sourceHeaders = readHeaders(payload.headers);
  const tracks = readTracks(payload.tracks);
  for (const item of payload.sources) {
    if (!isRecord(item) || typeof item.url !== "string") continue;
    const media = resolveMedia(item.url, SOURCE_API, item.type ?? item.mimeType);
    if (!media) continue;
    const headers = new Headers(media.headers);
    for (const [name, value] of Object.entries(sourceHeaders)) headers.set(name, value);
    const stream: Stream = {
      ...media,
      headers: Object.fromEntries(headers.entries()),
      ...(tracks ? { tracks } : {})
    };
    if (await probeMedia(stream)) return stream;
  }
  return null;
}

export async function resolveAniEmbed(target: string): Promise<Stream | null> {
  const request = parseRequest(target);
  if (!request) return null;

  try {
    const page = await fetchText(
      request.url.href,
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      { Referer: `${ANIEMBED_ORIGIN}/` }
    );
    if (!page?.response.ok) return null;
    const bootstrap = parseBootstrap(page.text, request);
    if (!bootstrap) return null;

    for (const providerId of bootstrap.providerIds) {
      const stream = await resolveSource(request, bootstrap.id, providerId);
      if (stream) return stream;
    }
    return null;
  } catch {
    return null;
  }
}
