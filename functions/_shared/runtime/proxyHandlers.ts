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
    subpath === "ts-proxy" ||
    subpath.startsWith("download/")
  ) {
    return scraperApp.fetch(
      request,
      {
        ...env,
        launchBrowser: () => puppeteer.launch((env as any).MYBROWSER)
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
