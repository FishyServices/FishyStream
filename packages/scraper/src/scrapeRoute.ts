import { Hono } from "hono";
import { getDiscoveredMediaHeaders, getRequestHeaders, releaseBrowser } from "./fetcher";
import {
  buildProxyUrl,
  deriveOriginAndReferer,
  extractSourcesPayload,
  findMediaCandidateInText,
  findPlayableMediaInObject,
  getMediaType,
  isFetchableUrl,
  resolveMediaCandidate,
  unwrapMediaProxy
} from "./media";
import type { Bindings, StreamHeaders, StreamResult } from "./types";
import { resolveVidLux } from "./providerResolvers";

function shouldUseMediaResult(current: StreamResult | null): boolean {
  return !current || current.mediaType !== "hls";
}

export function registerScrapeRoute(app: Hono<{ Bindings: Bindings }>): void {
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
      const browserHeaders = Object.fromEntries(
        Object.entries(pageHeaders).filter(([, value]) => value)
      );
      if (Object.keys(browserHeaders).length) await page.setExtraHTTPHeaders(browserHeaders);

      await page.evaluateOnNewDocument(() => {
        // @ts-ignore
        const originalFetch = window.fetch;
        // @ts-ignore
        window.fetch = async function (...args) {
          // @ts-ignore
          const response = await originalFetch.apply(this, args);
          response
            .clone()
            .text()
            .then((text: string) => {
              if (/m3u8|\.mp4|\.webm/i.test(text)) console.log(`[INJECT-BODY] ${text}`);
            })
            .catch(() => {});
          return response;
        };

        // @ts-ignore
        const originalOpen = XMLHttpRequest.prototype.open;
        // @ts-ignore
        XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, ...args) {
          // @ts-ignore
          this.addEventListener("load", function (this: XMLHttpRequest) {
            // @ts-ignore
            if (
              (this.responseType === "" || this.responseType === "text") &&
              // @ts-ignore
              typeof this.responseText === "string" &&
              /m3u8|\.mp4|\.webm/i.test(this.responseText)
            ) {
              // @ts-ignore
              console.log(`[INJECT-BODY] ${this.responseText}`);
            }
          });
          // @ts-ignore
          return originalOpen.apply(this, args);
        };
      });

      page.on("console", (message: any) => {
        const text: string = message.text();
        const injected = text.startsWith("[INJECT-BODY]");
        const raw = injected ? text.slice("[INJECT-BODY] ".length).trim() : text;

        if (injected) {
          try {
            const payload = extractSourcesPayload(JSON.parse(raw), targetUrl);
            if (!result && payload) {
              console.log("[Scraper] Found stream via injected fetch/XHR interception");
              result = {
                url: payload.file,
                mediaType: payload.mediaType,
                headers: { ...pageHeaders, ...payload.headers },
                tracks: payload.tracks,
                intro: payload.intro,
                outro: payload.outro
              };
              return;
            }
          } catch {}
        }

        const candidate = findMediaCandidateInText(raw, targetUrl);
        if (candidate && shouldUseMediaResult(result)) {
          console.log(`[Scraper] Found ${candidate.mediaType} in browser console output`);
          result = { url: candidate.url, mediaType: candidate.mediaType, headers: pageHeaders };
        }
      });

      page.on("response", async (response: any) => {
        const url: string = response.url();
        const contentType: string = response.headers()["content-type"] ?? "";
        const responseHeaders = getRequestHeaders(response, pageHeaders);
        const mediaType =
          getMediaType(url) ||
          (/mpegurl|x-mpegurl|vnd\.apple\.mpegurl/i.test(contentType) ? "hls" : null);
        const responseType = response.request?.().resourceType?.();
        const isVideoFile =
          responseType === "media" &&
          (contentType.includes("video/mp4") || contentType.includes("video/webm"));

        if (mediaType && isFetchableUrl(url) && !url.includes("m3u8-proxy")) {
          const captured = unwrapMediaProxy(url, responseHeaders);
          if (!isFetchableUrl(captured.url) || !shouldUseMediaResult(result)) return;
          console.log(`[Scraper] Found ${mediaType} directly in network: ${captured.url}`);
          result = { url: captured.url, mediaType, headers: captured.headers };
          return;
        }
        if (isVideoFile) {
          if (!isFetchableUrl(url)) return;
          const captured = unwrapMediaProxy(url, responseHeaders);
          if (!isFetchableUrl(captured.url) || !shouldUseMediaResult(result)) return;
          console.log(`[Scraper] Found video file directly in network: ${captured.url}`);
          result = { url: captured.url, mediaType: "file", headers: captured.headers };
          return;
        }

        const isJson = contentType.includes("application/json");
        const isScript = contentType.includes("javascript") || url.endsWith(".js");
        if (!isJson && !isScript) return;
        try {
          if (result) return;
          const text = await response.text();
          if (isJson) {
            const json = JSON.parse(text);
            const payload = extractSourcesPayload(json, url);
            if (payload) {
              console.log(`[Scraper] Found getSources payload in JSON response: ${url}`);
              result = {
                url: payload.file,
                mediaType: payload.mediaType,
                headers: { ...getDiscoveredMediaHeaders(responseHeaders, url), ...payload.headers },
                tracks: payload.tracks,
                intro: payload.intro,
                outro: payload.outro
              };
              return;
            }
            const deep = findPlayableMediaInObject(json, url);
            if (deep) {
              console.log(`[Scraper] Found ${deep.mediaType} deep in JSON tree: ${url}`);
              result = {
                url: deep.url,
                mediaType: deep.mediaType,
                headers: { ...getDiscoveredMediaHeaders(responseHeaders, url), ...deep.headers }
              };
              return;
            }
          }
          const candidate = findMediaCandidateInText(text, url);
          if (candidate) {
            console.log(
              `[Scraper] Found ${candidate.mediaType} via regex in script/response: ${url}`
            );
            result = {
              url: candidate.url,
              mediaType: candidate.mediaType,
              headers: responseHeaders
            };
          }
        } catch {}
      });

      const providerResult = await resolveVidLux(targetUrl);
      if (providerResult) {
        result = providerResult;
      } else {
        await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      }
      const pageMediaUrlsRaw: unknown = await page.evaluate(`
        Array.from(document.querySelectorAll("video, source"))
          .flatMap((element) => [element.currentSrc || "", element.src || "", element.getAttribute("data-src") || ""])
          .filter(Boolean)
      `);
      for (const mediaUrl of Array.isArray(pageMediaUrlsRaw) ? pageMediaUrlsRaw : []) {
        if (typeof mediaUrl !== "string") continue;
        const candidate = resolveMediaCandidate(mediaUrl, undefined, targetUrl);
        if (candidate) {
          console.log(`[Scraper] Found ${candidate.mediaType} in the player DOM`);
          result = { url: candidate.url, mediaType: candidate.mediaType, headers: pageHeaders };
          break;
        }
      }

      let retries = 60;
      while (!result && retries-- > 0) await new Promise((resolve) => setTimeout(resolve, 500));
      if (!result) return c.json({ error: "Could not find a playable stream" }, 404);

      const found = result;
      const cookies = (await page.cookies(targetUrl, found.url))
        .map((cookie: { name: string; value: string }) => `${cookie.name}=${cookie.value}`)
        .join("; ");
      const proxyHeaders: StreamHeaders = cookies
        ? { ...found.headers, Cookie: cookies }
        : found.headers;
      const host = c.req.header("host") ?? "localhost:4000";
      const base = `${host.includes("localhost") ? "http" : "https"}://${host}`;
      const proxyUrl = buildProxyUrl(
        base,
        found.mediaType === "hls" ? "/api/m3u8-proxy" : "/api/media-proxy",
        found.url,
        proxyHeaders
      );
      const proxiedTracks = Array.isArray(found.tracks)
        ? found.tracks.map((track: any) =>
            typeof track?.file === "string"
              ? {
                  ...track,
                  file: buildProxyUrl(base, "/api/subtitle-proxy", track.file, proxyHeaders)
                }
              : track
          )
        : found.tracks;
      console.log("[Scraper] Success — stream proxied");
      return c.json({
        streamUrl: proxyUrl,
        mediaType: found.mediaType,
        tracks: proxiedTracks ?? null,
        intro: found.intro ?? null,
        outro: found.outro ?? null
      });
    } catch (error: any) {
      console.error("[Scraper] Error:", error);
      return c.json({ error: "Scraping failed", details: error.message }, 500);
    } finally {
      await releaseBrowser(browser);
    }
  });
}
