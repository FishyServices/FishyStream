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

function findM3u8InObject(obj: any): string | null {
  if (typeof obj === "string" && obj.includes(".m3u8")) return obj;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findM3u8InObject(item);
      if (found) return found;
    }
  } else if (typeof obj === "object" && obj !== null) {
    for (const key of Object.keys(obj)) {
      const found = findM3u8InObject(obj[key]);
      if (found) return found;
    }
  }
  return null;
}

function extractSourcesPayload(
  json: any
): { file: string; tracks?: any; intro?: any; outro?: any } | null {
  const sources = json?.sources;
  if (!sources) return null;

  const file = Array.isArray(sources) ? sources[0]?.file : sources?.file;
  if (typeof file === "string" && file.includes(".m3u8")) {
    return { file, tracks: json.tracks, intro: json.intro, outro: json.outro };
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
            if (text.includes("m3u8")) console.log(`[INJECT-BODY] ${text}`);
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
            this.responseText.includes("m3u8")
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
            headers: pageHeaders,
            tracks: payload.tracks,
            intro: payload.intro,
            outro: payload.outro
          };
          return;
        }
      } catch {}

      const match = raw.match(/https?:\/\/[^\s"'`]+\.m3u8[^\s"'`]*/i);
      if (match) {
        console.log(`[Scraper] Found m3u8 via regex in injected body`);
        result = { url: match[0], headers: pageHeaders };
      }
    });

    page.on("response", async (response: any) => {
      if (result) return;

      const url: string = response.url();
      const contentType: string = response.headers()["content-type"] ?? "";

      if ((url.includes(".m3u8") || url.includes("manifest")) && !url.includes("m3u8-proxy")) {
        console.log(`[Scraper] Found m3u8 directly in network: ${url}`);
        result = { url, headers: pageHeaders };
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
              headers: pageHeaders,
              tracks: payload.tracks,
              intro: payload.intro,
              outro: payload.outro
            };
            return;
          }

          const deep = findM3u8InObject(json);
          if (deep) {
            console.log(`[Scraper] Found m3u8 deep in JSON tree: ${url}`);
            result = { url: deep, headers: pageHeaders };
            return;
          }
        }

        const match = text.match(/https?:\/\/[^\s"'`]+\.m3u8[^\s"'`]*/i);
        if (match) {
          console.log(`[Scraper] Found m3u8 via regex in script/response: ${url}`);
          result = { url: match[0], headers: pageHeaders };
        }
      } catch {}
    });

    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    let retries = 30;
    while (!result && retries-- > 0) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!result) return c.json({ error: "Could not find .m3u8 stream" }, 404);

    const found: StreamResult = result;

    const host = c.req.header("host") ?? "localhost:4000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const base = `${protocol}://${host}`;

    const proxyUrl = buildProxyUrl(base, "/api/m3u8-proxy", found.url, found.headers);
    console.log(`[Scraper] Success — stream proxied`);

    return c.json({
      streamUrl: proxyUrl,
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
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...extraHeaders
      }
    });

    if (!response.ok) throw new Error(`Failed to fetch M3U8: ${response.status}`);

    const m3u8Content = await response.text();
    const isMaster = m3u8Content.includes("RESOLUTION=");

    const host = c.req.header("host") ?? "localhost:4000";
    const protocol = host.includes("localhost") ? "http" : "https";
    const base = `${protocol}://${host}`;
    const encodedHeaders = encodeURIComponent(JSON.stringify(extraHeaders));

    const m3u8Url: string = url;

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
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...extraHeaders
      }
    });

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
