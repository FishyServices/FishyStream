import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  MYBROWSER: any;
  launchBrowser: () => Promise<any>;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

app.get("/api/scrape", async (c) => {
  const targetUrl = c.req.query("url");
  if (!targetUrl) {
    return c.json({ error: "Missing url parameter" }, 400);
  }

  console.log(`\n[Scraper] Starting scrape for: ${targetUrl}`);
  let browser;

  try {
    browser = await c.env.launchBrowser();
    const page = await browser.newPage();

    let streamUrl: string | null = null;
    let streamHeaders: Record<string, string> = {};

    const targetOrigin = new URL(targetUrl).origin + "/";
    await page.setExtraHTTPHeaders({
      Referer: targetOrigin,
      Origin: new URL(targetUrl).origin
    });

    let currentTracks: any;
    let currentIntro: any;
    let currentOutro: any;

    await page.evaluateOnNewDocument(() => {
      // @ts-ignore
      const originalFetch = window.fetch;
      // @ts-ignore
      window.fetch = async function (...args: any[]) {
        // @ts-ignore
        const response = await originalFetch.apply(this, args);
        const clone = response.clone();
        clone
          .text()
          .then((text: string) => {
            if (text.includes("m3u8")) {
              console.log(`[INJECT-BODY] ${text}`);
            }
          })
          .catch((e: any) => {});
        return response;
      };

      // @ts-ignore
      const originalOpen = XMLHttpRequest.prototype.open;
      // @ts-ignore
      XMLHttpRequest.prototype.open = function (...args: any[]) {
        // @ts-ignore
        this.addEventListener("load", function () {
          // @ts-ignore
          if (this.responseType === "" || this.responseType === "text") {
            // @ts-ignore
            const text = this.responseText;
            if (typeof text === "string" && text.includes("m3u8")) {
              console.log(`[INJECT-BODY] ${text}`);
            }
          }
        });
        // @ts-ignore
        return originalOpen.apply(this, args);
      };
    });

    page.on("console", (msg: any) => {
      const text = msg.text();
      if (text.startsWith("[INJECT-BODY]")) {
        try {
          const jsonStr = text.replace("[INJECT-BODY] ", "").trim();
          const json = JSON.parse(jsonStr);
          if (
            json.sources &&
            (json.sources.file || (Array.isArray(json.sources) && json.sources[0].file))
          ) {
            const file = Array.isArray(json.sources) ? json.sources[0].file : json.sources.file;
            if (file && file.includes(".m3u8")) {
              console.log(`[Scraper] Found getSources payload from INJECT-BODY!`);
              streamUrl = file;
              streamHeaders["Referer"] = "https://megaplay.buzz/";
              streamHeaders["Origin"] = "https://megaplay.buzz";

              if (json.tracks) currentTracks = json.tracks;
              if (json.intro) currentIntro = json.intro;
              if (json.outro) currentOutro = json.outro;
            }
          } else {
            const m3u8Match = jsonStr.match(/https?:\/\/[^\s"'`]+\.m3u8[^\s"'`]*/i);
            if (m3u8Match && !streamUrl) {
              console.log(`[Scraper] Found m3u8 from generic INJECT-BODY regex!`);
              streamUrl = m3u8Match[0];
              streamHeaders["Referer"] = "https://megaplay.buzz/";
              streamHeaders["Origin"] = "https://megaplay.buzz";
            }
          }
        } catch (e) {}
      }
    });

    page.on("response", async (response: any) => {
      if (streamUrl) return;

      const url = response.url();
      const contentType = response.headers()["content-type"] || "";

      if ((url.includes(".m3u8") || url.includes("manifest")) && !url.includes("m3u8-proxy")) {
        console.log(`[Scraper] Found m3u8 directly: ${url}`);
        streamUrl = url;
        const reqHeaders = response.request().headers();
        if (reqHeaders.referer) streamHeaders["Referer"] = reqHeaders.referer;
        if (reqHeaders.origin) streamHeaders["Origin"] = reqHeaders.origin;
        return;
      }

      if (
        contentType.includes("application/json") ||
        contentType.includes("javascript") ||
        url.includes(".js")
      ) {
        try {
          const text = await response.text();

          if (contentType.includes("application/json")) {
            const json = JSON.parse(text);

            if (
              json.sources &&
              (json.sources.file || (Array.isArray(json.sources) && json.sources[0].file))
            ) {
              const file = Array.isArray(json.sources) ? json.sources[0].file : json.sources.file;
              if (file && file.includes(".m3u8")) {
                console.log(`[Scraper] Found getSources payload: ${file}`);
                streamUrl = file;
                const reqHeaders = response.request().headers();
                if (reqHeaders.referer) streamHeaders["Referer"] = reqHeaders.referer;
                if (reqHeaders.origin) streamHeaders["Origin"] = reqHeaders.origin;

                if (json.tracks) currentTracks = json.tracks;
                if (json.intro) currentIntro = json.intro;
                if (json.outro) currentOutro = json.outro;
                return;
              }
            }

            const findM3u8 = (obj: any): string | null => {
              if (typeof obj === "string" && obj.includes(".m3u8")) return obj;
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  const r = findM3u8(item);
                  if (r) return r;
                }
              } else if (typeof obj === "object" && obj !== null) {
                for (const key in obj) {
                  const r = findM3u8(obj[key]);
                  if (r) return r;
                }
              }
              return null;
            };
            const found = findM3u8(json);
            if (found && !streamUrl) {
              console.log(`[Scraper] Found m3u8 inside JSON tree from: ${url}`);
              streamUrl = found;
              const reqHeaders = response.request().headers();
              if (reqHeaders.referer) streamHeaders["Referer"] = reqHeaders.referer;
              if (reqHeaders.origin) streamHeaders["Origin"] = reqHeaders.origin;
            }
          } else {
            const m3u8Match = text.match(/https?:\/\/[^\s"'`]+\.m3u8[^\s"'`]*/i);
            if (m3u8Match && !streamUrl) {
              console.log(`[Scraper] Found hidden m3u8 inside text of: ${url}`);
              streamUrl = m3u8Match[0];
              const reqHeaders = response.request().headers();
              if (reqHeaders.referer) streamHeaders["Referer"] = reqHeaders.referer;
              if (reqHeaders.origin) streamHeaders["Origin"] = reqHeaders.origin;
            }
          }
        } catch (e) {}
      }
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    let retries = 30;
    while (!streamUrl && retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      retries--;
    }

    if (streamUrl) {
      const host = c.req.header("host") || "localhost:4000";
      const protocol = host.includes("localhost") ? "http" : "https";

      const proxyUrl = `${protocol}://${host}/api/m3u8-proxy?url=${encodeURIComponent(streamUrl)}&headers=${encodeURIComponent(JSON.stringify(streamHeaders))}`;
      console.log(`[Scraper] Success. Returning proxy url: ${proxyUrl}`);

      return c.json({
        streamUrl: proxyUrl,
        tracks: currentTracks,
        intro: currentIntro,
        outro: currentOutro
      });
    } else {
      return c.json({ error: "Could not find .m3u8 stream" }, 404);
    }
  } catch (error: any) {
    console.error("[Scraper] Error:", error);
    return c.json({ error: "Scraping failed", details: error.message }, 500);
  } finally {
    if (browser) await browser.close();
  }
});

function parseURL(req_url: string, baseUrl?: string) {
  if (baseUrl) return new URL(req_url, baseUrl).href;
  return req_url;
}

app.get("/api/m3u8-proxy", async (c) => {
  const url = c.req.query("url");
  const headersParam = c.req.query("headers");

  if (!url) return c.text("URL parameter is required", 400);
  console.log(`[Proxy] Fetching M3U8: ${url}`);

  let headers = {};
  try {
    headers = headersParam ? JSON.parse(headersParam) : {};
  } catch (e) {
    return c.text("Invalid headers format", 400);
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers
      }
    });

    if (!response.ok) throw new Error(`Failed to fetch M3U8: ${response.status}`);

    const m3u8Content = await response.text();
    const host = c.req.header("host") || "localhost:4000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const baseProxyUrl = `${protocol}://${host}`;

    const lines = m3u8Content.split("\n");
    const newLines: string[] = [];

    const isMasterPlaylist = m3u8Content.includes("RESOLUTION=");

    for (const line of lines) {
      if (line.startsWith("#")) {
        if (line.includes('URI="')) {
          const match = line.match(/URI="([^"]+)"/);
          if (match && match[1]) {
            const originalUri = match[1];
            const parsedUri = parseURL(originalUri, url);
            const isMedia = line.startsWith("#EXT-X-MEDIA");
            const proxyEndpoint = isMedia ? "/api/m3u8-proxy" : "/api/ts-proxy";
            const proxyUri = `${baseProxyUrl}${proxyEndpoint}?url=${encodeURIComponent(parsedUri)}&headers=${encodeURIComponent(JSON.stringify(headers))}`;
            newLines.push(line.replace(`URI="${originalUri}"`, `URI="${proxyUri}"`));
          } else {
            newLines.push(line);
          }
        } else {
          newLines.push(line);
        }
      } else if (line.trim()) {
        const parsedUrl = parseURL(line, url);
        if (parsedUrl) {
          if (isMasterPlaylist) {
            newLines.push(
              `${baseProxyUrl}/api/m3u8-proxy?url=${encodeURIComponent(parsedUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`
            );
          } else {
            newLines.push(
              `${baseProxyUrl}/api/ts-proxy?url=${encodeURIComponent(parsedUrl)}&headers=${encodeURIComponent(JSON.stringify(headers))}`
            );
          }
        } else {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
    }

    return c.text(newLines.join("\n"), 200, {
      "Content-Type": "application/vnd.apple.mpegurl",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Cache-Control": "no-cache, no-store, must-revalidate"
    });
  } catch (error: any) {
    console.error("Error proxying M3U8:", error);
    return c.text(error.message, 500);
  }
});

app.get("/api/ts-proxy", async (c) => {
  const url = c.req.query("url");
  const headersParam = c.req.query("headers");

  if (!url) return c.text("URL parameter is required", 400);
  console.log(`[Proxy] Fetching TS Chunk: ${url.split("/").pop()}`);

  let headers = {};
  try {
    headers = headersParam ? JSON.parse(headersParam) : {};
  } catch (e) {
    return c.text("Invalid headers format", 400);
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...headers
      }
    });

    if (!response.ok) throw new Error(`Failed to fetch TS file: ${response.status}`);

    const buffer = await response.arrayBuffer();

    return c.body(buffer, 200, {
      "Content-Type": "video/mp2t",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600"
    });
  } catch (error: any) {
    console.error("Error proxying TS file:", error);
    return c.text(error.message, 500);
  }
});

export default app;
