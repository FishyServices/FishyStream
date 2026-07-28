import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  MYBROWSER: any;
  launchBrowser: () => Promise<any>;
};

type StreamHeaders = {
  Referer?: string;
  Origin?: string;
  [key: string]: string | undefined;
};

type StreamResult = {
  url: string;
  mediaType: "hls" | "file";
  headers: StreamHeaders;
  tracks?: any;
  intro?: any;
  outro?: any;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

function deriveOriginAndReferer(sourceUrl: string): StreamHeaders {
  try {
    const parsed = new URL(sourceUrl);
    return {
      Origin: parsed.origin,
      Referer: parsed.origin + "/"
    };
  } catch {
    return {};
  }
}

function resolveUrl(relative: string, base: string): string {
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

function getMediaType(url: string): "hls" | "file" | null {
  if (/\.m3u8(?:[?#]|$)/i.test(url)) return "hls";
  if (/\.mp4(?:[?#]|$)|\.webm(?:[?#]|$)|mp4-proxy|video-proxy/i.test(url)) return "file";
  return null;
}

function findPlayableMediaInObject(obj: any): { url: string; mediaType: "hls" | "file" } | null {
  if (typeof obj === "string") {
    const mediaType = getMediaType(obj);
    return mediaType ? { url: obj, mediaType } : null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findPlayableMediaInObject(item);
      if (found) return found;
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const key of Object.keys(obj)) {
      const found = findPlayableMediaInObject(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

function extractSourcesPayload(
  json: any
): { file: string; mediaType: "hls" | "file"; tracks?: any; intro?: any; outro?: any } | null {
  const sources = json?.sources;
  if (!sources) return null;

  const file = Array.isArray(sources) ? sources[0]?.file : sources?.file;
  if (typeof file === "string") {
    const mediaType = getMediaType(file);
    if (mediaType) {
      return { file, mediaType, tracks: json.tracks, intro: json.intro, outro: json.outro };
    }
  }
  return null;
}

function buildProxyUrl(
  base: string,
  endpoint: string,
  targetUrl: string,
  headers: StreamHeaders
): string {
  return `${base}${endpoint}?url=${encodeURIComponent(targetUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
}

function getOriginHeaders(url: string): StreamHeaders {
  try {
    const origin = new URL(url).origin;
    return { Origin: origin, Referer: `${origin}/` };
  } catch {
    return {};
  }
}

function unwrapMediaProxy(url: string, headers: StreamHeaders) {
  try {
    const parsed = new URL(url);
    const nestedUrl = parsed.searchParams.get("url");
    if (!nestedUrl || !/mp4-proxy|video-proxy/i.test(parsed.pathname)) {
      return { url, headers };
    }

    let nestedHeaders: StreamHeaders = {};
    const encodedHeaders = parsed.searchParams.get("headers");
    if (encodedHeaders) {
      try {
        nestedHeaders = JSON.parse(encodedHeaders);
      } catch {}
    }
    return { url: nestedUrl, headers: { ...headers, ...nestedHeaders } };
  } catch {
    return { url, headers };
  }
}

async function fetchWithReferrerFallback(url: string, headers: StreamHeaders) {
  const requestHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    ...headers
  };
  const response = await fetch(url, { headers: requestHeaders });
  if (response.status !== 401 && response.status !== 403) return response;

  const fallbackHeaders = {
    ...requestHeaders,
    ...getOriginHeaders(url)
  };
  if (
    fallbackHeaders.Referer === requestHeaders.Referer &&
    fallbackHeaders.Origin === requestHeaders.Origin
  ) {
    return response;
  }

  return fetch(url, { headers: fallbackHeaders });
}

async function fetchWithBrowserFallback(
  url: string,
  headers: StreamHeaders,
  launchBrowser: () => Promise<any>
): Promise<{ body: ArrayBuffer; contentType: string }> {
  let browser: any;

  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    const browserHeaders = Object.fromEntries(
      Object.entries(headers).filter(
        ([name]) => !["host", "content-length", "connection"].includes(name.toLowerCase())
      )
    );
    if (Object.keys(browserHeaders).length > 0) {
      await page.setExtraHTTPHeaders(browserHeaders);
    }

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 20_000
    });

    if (!response || response.status() < 200 || response.status() >= 300) {
      throw new Error(`Browser fallback failed: ${response?.status() ?? "no response"}`);
    }

    return {
      body: await response.buffer(),
      contentType: response.headers()["content-type"] ?? "application/octet-stream"
    };
  } finally {
    if (browser) await browser.close();
  }
}

import downloadsApp from "./downloads";

app.route("/api/download", downloadsApp);

app.get("/api/scrape", async (c) => {
  const targetUrl = c.req.query("url");
  if (!targetUrl) return c.json({ error: "Missing url parameter" }, 400);

  console.log(`\n[Scraper] Starting scrape for: ${targetUrl}`);

  let browser: any;
  let result: StreamResult | null = null;

  try {
    browser = await c.env.launchBrowser();
    const page = await browser.newPage();

    const pageHeaders = deriveOriginAndReferer(targetUrl);
    await page.setExtraHTTPHeaders({
      Referer: pageHeaders.Referer ?? "",
      Origin: pageHeaders.Origin ?? ""
    });

    await page.evaluateOnNewDocument(() => {
      // @ts-ignore
      const _fetch = window.fetch;
      // @ts-ignore
      window.fetch = async function (...args) {
        // @ts-ignore
        const res = await _fetch.apply(this, args);
        res
          .clone()
          .text()
          .then((text: string) => {
            if (/m3u8|\.mp4|\.webm/i.test(text)) console.log(`[INJECT-BODY] ${text}`);
          })
          .catch(() => {});
        return res;
      };

      // @ts-ignore
      const _open = XMLHttpRequest.prototype.open;
      // @ts-ignore
      XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args) {
        // @ts-ignore
        this.addEventListener("load", function (this: XMLHttpRequest) {
          // @ts-ignore
          if (
            (this.responseType === "" || this.responseType === "text") &&
            // @ts-ignore
            typeof this.responseText === "string" &&
            // @ts-ignore
            /m3u8|\.mp4|\.webm/i.test(this.responseText)
          ) {
            // @ts-ignore
            console.log(`[INJECT-BODY] ${this.responseText}`);
          }
        });
        // @ts-ignore
        return _open.apply(this, args);
      };
    });

    page.on("console", (msg: any) => {
      if (result) return;
      const text: string = msg.text();
      if (!text.startsWith("[INJECT-BODY]")) return;

      const raw = text.slice("[INJECT-BODY] ".length).trim();

      try {
        const json = JSON.parse(raw);
        const payload = extractSourcesPayload(json);
        if (payload) {
          console.log(`[Scraper] Found stream via injected fetch/XHR interception`);
          result = {
            url: payload.file,
            mediaType: payload.mediaType,
            headers: pageHeaders,
            tracks: payload.tracks,
            intro: payload.intro,
            outro: payload.outro
          };
          return;
        }
      } catch {}

      const match = raw.match(/https?:\/\/[^\s"'`]+(?:\.m3u8|\.mp4|\.webm)[^\s"'`]*/i);
      if (match) {
        const mediaType = getMediaType(match[0]);
        if (!mediaType) return;
        console.log(`[Scraper] Found ${mediaType} via regex in injected body`);
        result = { url: match[0], mediaType, headers: pageHeaders };
      }
    });

    page.on("response", async (response: any) => {
      if (result) return;

      const url: string = response.url();
      const contentType: string = response.headers()["content-type"] ?? "";

      const mediaType =
        getMediaType(url) ||
        (/mpegurl|x-mpegurl|vnd\.apple\.mpegurl/i.test(contentType) ? "hls" : null);
      const responseType = response.request?.().resourceType?.();
      const contentIsVideoFile =
        responseType === "media" &&
        (contentType.includes("video/mp4") || contentType.includes("video/webm"));

      if (mediaType && !url.includes("m3u8-proxy")) {
        const captured = unwrapMediaProxy(url, pageHeaders);
        console.log(`[Scraper] Found ${mediaType} directly in network: ${captured.url}`);
        result = { url: captured.url, mediaType, headers: captured.headers };
        return;
      }

      if (contentIsVideoFile) {
        const captured = unwrapMediaProxy(url, pageHeaders);
        console.log(`[Scraper] Found video file directly in network: ${captured.url}`);
        result = { url: captured.url, mediaType: "file", headers: captured.headers };
        return;
      }

      const isJson = contentType.includes("application/json");
      const isScript = contentType.includes("javascript") || url.endsWith(".js");
      if (!isJson && !isScript) return;

      try {
        const text = await response.text();

        if (isJson) {
          const json = JSON.parse(text);
          const payload = extractSourcesPayload(json);
          if (payload) {
            console.log(`[Scraper] Found getSources payload in JSON response: ${url}`);
            result = {
              url: payload.file,
              mediaType: payload.mediaType,
              headers: pageHeaders,
              tracks: payload.tracks,
              intro: payload.intro,
              outro: payload.outro
            };
            return;
          }

          const deep = findPlayableMediaInObject(json);
          if (deep) {
            console.log(`[Scraper] Found ${deep.mediaType} deep in JSON tree: ${url}`);
            result = { url: deep.url, mediaType: deep.mediaType, headers: pageHeaders };
            return;
          }
        }

        const match = text.match(/https?:\/\/[^\s"'`]+(?:\.m3u8|\.mp4|\.webm)[^\s"'`]*/i);
        if (match) {
          const foundMediaType = getMediaType(match[0]);
          if (!foundMediaType) return;
          console.log(`[Scraper] Found ${foundMediaType} via regex in script/response: ${url}`);
          result = { url: match[0], mediaType: foundMediaType, headers: pageHeaders };
        }
      } catch {}
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    let retries = 30;
    while (!result && retries-- > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!result) return c.json({ error: "Could not find a playable stream" }, 404);

    const found: StreamResult = result;

    const host = c.req.header("host") ?? "localhost:4000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const base = `${protocol}://${host}`;

    const proxyUrl = buildProxyUrl(
      base,
      found.mediaType === "hls" ? "/api/m3u8-proxy" : "/api/media-proxy",
      found.url,
      found.headers
    );
    console.log(`[Scraper] Success — stream proxied`);

    return c.json({
      streamUrl: proxyUrl,
      mediaType: found.mediaType,
      tracks: found.tracks ?? null,
      intro: found.intro ?? null,
      outro: found.outro ?? null
    });
  } catch (err: any) {
    console.error("[Scraper] Error:", err);
    return c.json({ error: "Scraping failed", details: err.message }, 500);
  } finally {
    if (browser) await browser.close();
  }
});

app.get("/api/m3u8-proxy", async (c) => {
  const url = c.req.query("url");
  const headersParam = c.req.query("headers");
  if (!url) return c.text("URL parameter is required", 400);

  let extraHeaders: StreamHeaders = {};
  try {
    extraHeaders = headersParam ? JSON.parse(headersParam) : {};
  } catch {
    return c.text("Invalid headers format", 400);
  }

  console.log(`[Proxy] Fetching M3U8: ${url}`);

  try {
    const response = await fetchWithReferrerFallback(url, extraHeaders);

    if (!response.ok) throw new Error(`Failed to fetch M3U8: ${response.status}`);

    const m3u8Content = await response.text();
    const isMaster = /#EXT-X-STREAM-INF/i.test(m3u8Content);

    const host = c.req.header("host") ?? "localhost:4000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const base = `${protocol}://${host}`;
    const m3u8Url: string = url;
    const nestedHeaders: StreamHeaders = {
      ...extraHeaders,
      ...getOriginHeaders(m3u8Url),
      Referer: m3u8Url
    };
    const encodedHeaders = encodeURIComponent(JSON.stringify(nestedHeaders));

    const rewritten = m3u8Content
      .split("\n")
      .map((line) => {
        if (line.startsWith("#")) {
          const uriMatch = line.match(/URI="([^"]+)"/);
          if (uriMatch && uriMatch[1]) {
            const original: string = uriMatch[1];
            const resolved = resolveUrl(original, m3u8Url);
            const isMedia = line.startsWith("#EXT-X-MEDIA");
            const endpoint = isMedia ? "/api/m3u8-proxy" : "/api/ts-proxy";
            const proxied = `${base}${endpoint}?url=${encodeURIComponent(resolved)}&headers=${encodedHeaders}`;
            return line.replace(`URI="${original}"`, `URI="${proxied}"`);
          }
          return line;
        }

        if (!line.trim()) return line;

        const resolved = resolveUrl(line.trim(), m3u8Url);
        const endpoint = isMaster ? "/api/m3u8-proxy" : "/api/ts-proxy";
        return `${base}${endpoint}?url=${encodeURIComponent(resolved)}&headers=${encodedHeaders}`;
      })
      .join("\n");

    return c.text(rewritten, 200, {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate"
    });
  } catch (err: any) {
    console.error("[M3U8 Proxy] Error:", err);
    return c.text(err.message, 500);
  }
});

app.get("/api/media-proxy", async (c) => {
  const url = c.req.query("url");
  const headersParam = c.req.query("headers");
  if (!url) return c.text("URL parameter is required", 400);

  let extraHeaders: StreamHeaders = {};
  try {
    extraHeaders = headersParam ? JSON.parse(headersParam) : {};
  } catch {
    return c.text("Invalid headers format", 400);
  }

  const range = c.req.header("range");
  console.log(`[Proxy] Fetching media: ${url}`);

  try {
    const response = await fetchWithReferrerFallback(url, {
      ...extraHeaders,
      ...(range ? { Range: range } : {})
    });

    if (response.status === 401 || response.status === 403 || response.status === 429) {
      console.log(`[Media Proxy] Upstream returned ${response.status}; retrying through Chromium`);
      const browserResponse = await fetchWithBrowserFallback(
        url,
        {
          ...extraHeaders,
          ...(range ? { Range: range } : {})
        },
        c.env.launchBrowser
      );

      return c.body(browserResponse.body, 200, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers":
          "Accept-Ranges, Content-Length, Content-Range, Content-Type",
        "Content-Type": browserResponse.contentType || "video/mp4",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      });
    }

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to fetch media: ${response.status}`);
    }

    const responseHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
      "Accept-Ranges": response.headers.get("accept-ranges") ?? "bytes",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": response.headers.get("content-type") ?? "video/mp4"
    });

    for (const name of ["content-length", "content-range"]) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });
  } catch (err: any) {
    console.error("[Media Proxy] Error:", err);
    return c.text(err.message, 500);
  }
});

app.get("/api/ts-proxy", async (c) => {
  const url = c.req.query("url");
  const headersParam = c.req.query("headers");
  if (!url) return c.text("URL parameter is required", 400);

  let extraHeaders: StreamHeaders = {};
  try {
    extraHeaders = headersParam ? JSON.parse(headersParam) : {};
  } catch {
    return c.text("Invalid headers format", 400);
  }

  console.log(`[Proxy] Fetching TS chunk: ${url.split("/").pop() ?? ""}`);

  try {
    const response = await fetchWithReferrerFallback(url, extraHeaders);

    if (response.status === 401 || response.status === 403) {
      console.log(`[TS Proxy] Upstream returned ${response.status}; retrying through Chromium`);
      const browserResponse = await fetchWithBrowserFallback(
        url,
        extraHeaders,
        c.env.launchBrowser
      );

      return c.body(browserResponse.body, 200, {
        "Content-Type": "video/mp2t",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      });
    }

    if (!response.ok) throw new Error(`Failed to fetch TS chunk: ${response.status}`);

    const buffer = await response.arrayBuffer();

    return c.body(buffer, 200, {
      "Content-Type": "video/mp2t",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600"
    });
  } catch (err: any) {
    console.error("[TS Proxy] Error:", err);
    return c.text(err.message, 500);
  }
});

export default app;
