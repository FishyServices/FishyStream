import { getOriginHeaders, isFetchableUrl, isRecord } from "./media";
import type { StreamHeaders } from "./types";

export function getRequestHeaders(response: any, fallback: StreamHeaders): StreamHeaders {
  const request = response.request?.();
  const requestHeaders = request?.headers?.();
  if (!requestHeaders || typeof requestHeaders !== "object") return fallback;

  const headers: StreamHeaders = { ...fallback };
  const names = new Map([
    ["referer", "Referer"],
    ["origin", "Origin"],
    ["user-agent", "User-Agent"],
    ["cookie", "Cookie"]
  ]);
  for (const [name, value] of Object.entries(requestHeaders)) {
    const canonicalName = names.get(name.toLowerCase());
    if (canonicalName && typeof value === "string" && value) headers[canonicalName] = value;
  }
  return headers;
}

function getHeaderVariants(url: string, headers: StreamHeaders): StreamHeaders[] {
  const originHeaders = getOriginHeaders(url);
  const variants = [
    headers,
    { ...headers, ...originHeaders },
    { ...headers, Referer: originHeaders.Referer },
    (() => {
      const variant = { ...headers, Referer: originHeaders.Referer };
      delete variant.Origin;
      return variant;
    })()
  ];
  const seen = new Set<string>();

  return variants.filter((variant) => {
    const key = JSON.stringify(variant);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isCertificateVerificationError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.code === "UNKNOWN_CERTIFICATE_VERIFICATION_ERROR" ||
    (typeof error.message === "string" &&
      /certificate verification|certificate/i.test(error.message))
  );
}

export async function releaseBrowser(browser: any): Promise<void> {
  if (!browser) return;

  const isRemoteBrowser = typeof browser.process === "function" && browser.process() === null;
  if (isRemoteBrowser && typeof browser.disconnect === "function") {
    await browser.disconnect().catch(() => {});
    return;
  }
  if (typeof browser.close === "function") await browser.close().catch(() => {});
}

async function fetchUpstream(url: string, headers: StreamHeaders): Promise<Response> {
  const requestHeaders = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (typeof value === "string") requestHeaders.set(name, value);
  }
  return fetch(url, { headers: requestHeaders });
}

export async function fetchWithBrowserFallback(
  url: string,
  headers: StreamHeaders,
  launchBrowser: () => Promise<any>
): Promise<{ body: ArrayBuffer; contentType: string }> {
  let browser: any;

  try {
    browser = await launchBrowser();
    let lastStatus: number | "no response" = "no response";

    for (const variant of getHeaderVariants(url, headers)) {
      const page = await browser.newPage();
      try {
        const browserHeaders = Object.fromEntries(
          Object.entries(variant).filter(
            ([name, value]) =>
              value !== undefined &&
              !["host", "content-length", "connection"].includes(name.toLowerCase())
          )
        );
        if (Object.keys(browserHeaders).length > 0) {
          await page.setExtraHTTPHeaders(browserHeaders);
        }

        const response = await page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
          ...(variant.Referer ? { referer: variant.Referer } : {})
        });
        lastStatus = response?.status() ?? "no response";

        if (response && response.status() >= 200 && response.status() < 300) {
          return {
            body: await response.buffer(),
            contentType: response.headers()["content-type"] ?? "application/octet-stream"
          };
        }
      } finally {
        await page.close().catch(() => {});
      }
    }

    throw new Error(`Browser fallback failed: ${lastStatus}`);
  } finally {
    await releaseBrowser(browser);
  }
}

export async function fetchWithReferrerFallback(
  url: string,
  headers: StreamHeaders,
  launchBrowser?: () => Promise<any>
): Promise<Response> {
  if (!isFetchableUrl(url)) {
    throw new TypeError("Media URL must use the http:, https:, or s3: protocol");
  }

  const requestHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ...headers
  };
  let response: Response;

  try {
    response = await fetchUpstream(url, requestHeaders);
  } catch (error) {
    if (!launchBrowser || !isCertificateVerificationError(error)) throw error;
    const browserResponse = await fetchWithBrowserFallback(url, headers, launchBrowser);
    return new Response(browserResponse.body, {
      status: 200,
      headers: { "Content-Type": browserResponse.contentType }
    });
  }

  if (response.status !== 401 && response.status !== 403 && response.status !== 404) {
    return response;
  }

  const fallbackHeaders = { ...requestHeaders, ...getOriginHeaders(url) };
  if (
    fallbackHeaders.Referer === requestHeaders.Referer &&
    fallbackHeaders.Origin === requestHeaders.Origin
  ) {
    return response;
  }

  try {
    return await fetchUpstream(url, fallbackHeaders);
  } catch (error) {
    if (!launchBrowser || !isCertificateVerificationError(error)) throw error;
    const browserResponse = await fetchWithBrowserFallback(url, fallbackHeaders, launchBrowser);
    return new Response(browserResponse.body, {
      status: 200,
      headers: { "Content-Type": browserResponse.contentType }
    });
  }
}

export async function fetchWithRateLimitRetry(
  url: string,
  headers: StreamHeaders,
  launchBrowser?: () => Promise<any>
): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchWithReferrerFallback(url, headers, launchBrowser);
    if (response.status !== 429 || attempt === 2) return response;

    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs = Number.isFinite(retryAfter)
      ? Math.min(Math.max(retryAfter * 1000, 250), 4000)
      : 500 * 2 ** attempt;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Rate limit retry loop did not return a response");
}

export function getDiscoveredMediaHeaders(
  responseHeaders: StreamHeaders,
  responseUrl: string
): StreamHeaders {
  const originHeaders = getOriginHeaders(responseUrl);
  try {
    const parsed = new URL(responseUrl);
    if (parsed.hostname.startsWith("api.")) {
      const playerOrigin = `${parsed.protocol}//player.${parsed.hostname.slice(4)}`;
      return { ...responseHeaders, Origin: playerOrigin, Referer: `${playerOrigin}/` };
    }
  } catch {}
  return { ...responseHeaders, Referer: responseHeaders.Referer ?? originHeaders.Referer };
}

export type SegmentCacheEntry = {
  body: ArrayBuffer;
  contentType: string;
  expiresAt: number;
};

const SEGMENT_CACHE_TTL_MS = 60_000;
const SEGMENT_CACHE_MAX_ENTRIES = 256;
const segmentCache = new Map<string, SegmentCacheEntry>();
const segmentRequests = new Map<string, Promise<SegmentCacheEntry>>();

function getSegmentCacheKey(url: string, headers: StreamHeaders) {
  return `${url}\n${headers.Referer ?? ""}\n${headers.Origin ?? ""}\n${headers.Cookie ?? ""}`;
}

export async function fetchSegment(
  url: string,
  headers: StreamHeaders,
  launchBrowser: () => Promise<any>
): Promise<SegmentCacheEntry> {
  const key = getSegmentCacheKey(url, headers);
  const cached = segmentCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached;
  if (cached) segmentCache.delete(key);

  const existing = segmentRequests.get(key);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetchWithRateLimitRetry(url, headers, launchBrowser);
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 429
    ) {
      console.log(`[TS Proxy] Upstream returned ${response.status}; retrying through Chromium`);
      const browserResponse = await fetchWithBrowserFallback(url, headers, launchBrowser);
      return {
        body: browserResponse.body,
        contentType: browserResponse.contentType || "video/mp2t",
        expiresAt: Date.now() + SEGMENT_CACHE_TTL_MS
      };
    }
    if (!response.ok) throw new Error(`Failed to fetch TS chunk: ${response.status}`);

    return {
      body: await response.arrayBuffer(),
      contentType: response.headers.get("content-type") || "video/mp2t",
      expiresAt: Date.now() + SEGMENT_CACHE_TTL_MS
    };
  })();

  segmentRequests.set(key, request);
  try {
    const entry = await request;
    if (segmentCache.size >= SEGMENT_CACHE_MAX_ENTRIES) {
      const oldestKey = segmentCache.keys().next().value;
      if (typeof oldestKey === "string") segmentCache.delete(oldestKey);
    }
    segmentCache.set(key, entry);
    return entry;
  } finally {
    segmentRequests.delete(key);
  }
}
