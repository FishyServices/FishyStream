async function acquireBrowser(binding: any, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (typeof puppeteer.sessions === "function") {
        try {
          const sessions = await puppeteer.sessions(binding);
          const availableSession = sessions?.find((s: any) => !s.connectionId);
          if (availableSession?.sessionId) {
            return await puppeteer.connect(binding, availableSession.sessionId);
          }
        } catch {}
      }

      return await puppeteer.launch(binding);
    } catch (err: any) {
      const isRateLimit =
        err?.message?.includes("429") ||
        err?.message?.includes("Rate limit exceeded") ||
        err?.code === 429;
      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = (attempt + 1) * 1000 + Math.random() * 500;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
}

type RouteParam = string | string[] | undefined;

export interface PagesFunctionContext {
  request: Request;
  env: {
    VITE_CONVEX_SITE_URL?: string;
    CONVEX_SITE_URL?: string;
  };
  params: Record<string, RouteParam>;
}

function getSegments(value: RouteParam) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split("/").filter(Boolean);
  return [];
}

import scraperApp from "@fishy/scraper";
import puppeteer from "@cloudflare/puppeteer";

export async function handleApiRequest(context: PagesFunctionContext) {
  const { request, env, params } = context;
  const path = getSegments(params.path);
  const subpath = path.join("/");

  if (
    subpath === "scrape" ||
    subpath === "m3u8-proxy" ||
    subpath === "media-proxy" ||
    subpath === "subtitle-proxy" ||
    subpath === "ts-proxy" ||
    subpath.startsWith("download/")
  ) {
    return scraperApp.fetch(
      request,
      {
        ...env,
        launchBrowser: () => acquireBrowser((env as any).MYBROWSER)
      },
      context as any
    );
  }

  if (subpath === "imdb") {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "POST" }
      });
    }

    return fetch("https://api.graphql.imdb.com/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://www.imdb.com",
        Referer: "https://www.imdb.com/",
        "User-Agent": request.headers.get("User-Agent") ?? "FishyStream/1.0"
      },
      body: request.body
    });
  }

  const siteUrl = env.VITE_CONVEX_SITE_URL ?? env.CONVEX_SITE_URL ?? "";
  if (!siteUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Server misconfiguration: VITE_CONVEX_SITE_URL or CONVEX_SITE_URL is not set."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const base = siteUrl.replace(/\/$/, "");
  const url = new URL(request.url);
  const target = `${base}/api/${subpath}${url.search}`;

  return fetch(
    new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
    })
  );
}
