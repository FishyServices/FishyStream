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
