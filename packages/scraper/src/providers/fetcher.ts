import { findMedia, findMediaInText, originHeaders } from "./media";
import type { Stream, StreamHeaders } from "../types";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function requestHeaders(headers: StreamHeaders, url: string): Headers {
  const output = new Headers({
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/json,*/*"
  });
  for (const [name, value] of Object.entries(headers)) output.set(name, value);
  if (!output.has("Referer")) output.set("Referer", originHeaders(url).Referer ?? "");
  return output;
}

export const INSECURE_TLS = { tls: { rejectUnauthorized: false } } as Record<string, unknown>;

export async function fetchProvider(url: string, headers: StreamHeaders = {}): Promise<Response> {
  const response = await fetch(url, {
    headers: requestHeaders(headers, url),
    redirect: "follow",
    ...INSECURE_TLS
  });
  if (![401, 403, 404].includes(response.status)) return response;
  const fallback = { ...headers, ...originHeaders(url) };
  return fetch(url, {
    headers: requestHeaders(fallback, url),
    redirect: "follow",
    ...INSECURE_TLS
  });
}

async function isRateLimited(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.status !== 503 && response.status !== 502) return false;
  const body = await response
    .clone()
    .text()
    .catch(() => "");
  return /429|too many requests/i.test(body);
}

export async function fetchWithRetry(url: string, headers: StreamHeaders = {}): Promise<Response> {
  const maxAttempts = 5;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetchProvider(url, headers);
    if (!(await isRateLimited(response)) || attempt === maxAttempts - 1) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const delay =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 4000)
        : 400 * 2 ** attempt + Math.random() * 200;
    console.log(
      `[fetch] rate limited (${response.status}), retry ${attempt + 1}/${maxAttempts - 1} in ${Math.round(delay)}ms`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Provider retry loop did not return a response");
}

export async function resolveProvider(url: string): Promise<Stream | null> {
  const response = await fetchWithRetry(url);
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "";
  if (/mpegurl|m3u8/i.test(contentType)) {
    return {
      url: response.url || url,
      mediaType: "hls",
      headers: originHeaders(response.url || url)
    };
  }
  const text = await response.text();
  if (contentType.includes("json") || /^[\[{]/.test(text.trim())) {
    try {
      const stream = findMedia(JSON.parse(text), response.url || url);
      if (stream) return stream;
    } catch {}
  }
  return findMediaInText(text, response.url || url);
}

export async function isPlayableStream(stream: Stream): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  const headers = requestHeaders(stream.headers, stream.url);
  if (stream.mediaType === "file") headers.set("Range", "bytes=0-1023");

  try {
    const response = await fetch(stream.url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
      ...INSECURE_TLS
    });
    if (!response.ok && response.status !== 206) {
      console.warn(
        `[scraper] media probe got HTTP ${response.status} from ${new URL(stream.url).hostname}`
      );
      return false;
    }
    if (stream.mediaType === "hls") {
      const body = (await response.text()).replace(/^\uFEFF/, "").trimStart();
      if (!body.startsWith("#EXTM3U")) {
        console.warn(
          `[scraper] HLS probe from ${new URL(stream.url).hostname} did not return an m3u8 playlist:`,
          body.slice(0, 160)
        );
        return false;
      }
      return true;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    await response.body?.cancel().catch(() => undefined);
    if (/text\/|html|json|xml/.test(contentType)) {
      console.warn(
        `[scraper] file probe from ${new URL(stream.url).hostname} returned ${contentType || "unknown content type"}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      `[scraper] media probe failed for ${new URL(stream.url).hostname}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
