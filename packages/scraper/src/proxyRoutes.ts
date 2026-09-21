import { Hono } from "hono";
import { fetchSegment, fetchWithBrowserFallback, fetchWithRateLimitRetry } from "./fetcher";
import { getOriginHeaders, isFetchableUrl, sanitizeFilename } from "./media";
import { rewriteHlsPlaylist } from "./playlist";
import type { Bindings, StreamHeaders } from "./types";

function parseHeaders(value: string | undefined): StreamHeaders | Response {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return new Response("Invalid headers format", { status: 400 });
  }
}

function proxyBase(host: string | undefined): string {
  const resolvedHost = host ?? "localhost:4000";
  return `${resolvedHost.includes("localhost") ? "http" : "https"}://${resolvedHost}`;
}

export function registerProxyRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get("/api/subtitle-proxy", async (c) => {
    const url = c.req.query("url");
    if (!url) return c.text("URL parameter is required", 400);
    if (!isFetchableUrl(url)) return c.text("URL must use http:, https:, or s3:", 400);
    const headers = parseHeaders(c.req.query("headers"));
    if (headers instanceof Response) return headers;

    try {
      const response = await fetchWithRateLimitRetry(url, headers, c.env.launchBrowser);
      if (response.ok) {
        return c.text(await response.text(), 200, {
          "Content-Type": response.headers.get("content-type") ?? "text/vtt",
          "Access-Control-Allow-Origin": "*"
        });
      }
      if (response.status === 401 || response.status === 403) {
        const browserResponse = await fetchWithBrowserFallback(url, headers, c.env.launchBrowser);
        return c.body(browserResponse.body, 200, {
          "Content-Type": browserResponse.contentType || "text/vtt",
          "Access-Control-Allow-Origin": "*"
        });
      }
      return c.text(`Failed to fetch subtitles: ${response.status}`, 502);
    } catch (error: any) {
      console.error("[Subtitle Proxy] Error:", error);
      return c.text(error.message, 500);
    }
  });

  app.get("/api/m3u8-proxy", async (c) => {
    const url = c.req.query("url");
    if (!url) return c.text("URL parameter is required", 400);
    if (!isFetchableUrl(url)) return c.text("URL must use http:, https:, or s3:", 400);
    const headers = parseHeaders(c.req.query("headers"));
    if (headers instanceof Response) return headers;
    console.log(`[Proxy] Fetching M3U8: ${url}`);

    try {
      const response = await fetchWithRateLimitRetry(url, headers, c.env.launchBrowser);
      let content: string;
      if (response.ok) {
        content = await response.text();
      } else if (response.status === 401 || response.status === 403) {
        console.log(`[M3U8 Proxy] Upstream returned ${response.status}; retrying through Chromium`);
        const browserResponse = await fetchWithBrowserFallback(url, headers, c.env.launchBrowser);
        content = new TextDecoder().decode(browserResponse.body);
      } else {
        throw new Error(`Failed to fetch M3U8: ${response.status}`);
      }

      const playlistUrl = response.url || url;
      const nestedHeaders: StreamHeaders = {
        ...headers,
        ...(!headers.Origin && !headers.Referer ? getOriginHeaders(playlistUrl) : {})
      };
      const rewritten = rewriteHlsPlaylist({
        content,
        playlistUrl,
        base: proxyBase(c.req.header("host")),
        headers: nestedHeaders
      });

      return c.text(rewritten, 200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      });
    } catch (error: any) {
      console.error("[M3U8 Proxy] Error:", error);
      return c.text(error.message, 500);
    }
  });

  app.get("/api/media-proxy", async (c) => {
    const url = c.req.query("url");
    if (!url) return c.text("URL parameter is required", 400);
    if (!isFetchableUrl(url)) return c.text("URL must use http:, https:, or s3:", 400);
    const headers = parseHeaders(c.req.query("headers"));
    if (headers instanceof Response) return headers;
    const shouldDownload = c.req.query("download") === "1";
    const requestedFilename = c.req.query("filename");
    const range = c.req.header("range");
    const requestHeaders = { ...headers, ...(range ? { Range: range } : {}) };
    console.log(`[Proxy] Fetching media: ${url}`);

    try {
      const response = await fetchWithRateLimitRetry(url, requestHeaders, c.env.launchBrowser);
      if (response.status === 401 || response.status === 403 || response.status === 429) {
        console.log(
          `[Media Proxy] Upstream returned ${response.status}; retrying through Chromium`
        );
        const browserResponse = await fetchWithBrowserFallback(
          url,
          requestHeaders,
          c.env.launchBrowser
        );
        const responseHeaders: Record<string, string> = {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Expose-Headers":
            "Accept-Ranges, Content-Length, Content-Range, Content-Type",
          "Content-Type": browserResponse.contentType || "video/mp4",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        };
        if (shouldDownload)
          responseHeaders["Content-Disposition"] =
            `attachment; filename="${sanitizeFilename(requestedFilename)}"`;
        return c.body(browserResponse.body, 200, responseHeaders);
      }
      if (!response.ok && response.status !== 206)
        throw new Error(`Failed to fetch media: ${response.status}`);

      const responseHeaders = new Headers({
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Expose-Headers":
          "Accept-Ranges, Content-Length, Content-Range, Content-Type",
        "Accept-Ranges": response.headers.get("accept-ranges") ?? "bytes",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Content-Type": response.headers.get("content-type") ?? "video/mp4"
      });
      if (shouldDownload)
        responseHeaders.set(
          "Content-Disposition",
          `attachment; filename="${sanitizeFilename(requestedFilename)}"`
        );
      for (const name of ["content-length", "content-range"]) {
        const value = response.headers.get(name);
        if (value) responseHeaders.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    } catch (error: any) {
      console.error("[Media Proxy] Error:", error);
      return c.text(error.message, 500);
    }
  });

  app.get("/api/ts-proxy", async (c) => {
    const url = c.req.query("url");
    if (!url) return c.text("URL parameter is required", 400);
    if (!isFetchableUrl(url)) return c.text("URL must use http:, https:, or s3:", 400);
    const headers = parseHeaders(c.req.query("headers"));
    if (headers instanceof Response) return headers;
    console.log(`[Proxy] Fetching TS chunk: ${url.split("/").pop() ?? ""}`);

    try {
      const segment = await fetchSegment(url, headers, c.env.launchBrowser);
      return c.body(segment.body, 200, {
        "Content-Type": segment.contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600"
      });
    } catch (error: any) {
      console.error("[TS Proxy] Error:", error);
      return c.text(error.message, 500);
    }
  });
}
