type RouteParam = string | string[] | undefined;

export interface PagesFunctionContext {
  request: Request;
  env: {
    VITE_CONVEX_SITE_URL?: string;
    CONVEX_SITE_URL?: string;
    TMDB_API_KEY?: string;
  };
  params: Record<string, RouteParam>;
}

function getSegments(value: RouteParam) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.split("/").filter(Boolean);
  return [];
}

import scraperApp from "@fishy/scraper";
import { fetchAnimeCatalog } from "../catalog/animeCatalog";

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
      env,
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

  if (subpath === "anime") {
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ message: "Method Not Allowed" }), {
        status: 405,
        headers: { Allow: "GET", "Content-Type": "application/json" }
      });
    }
    if (!env.TMDB_API_KEY) {
      return new Response(JSON.stringify({ message: "TMDB_API_KEY is not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    try {
      const result = await fetchAnimeCatalog(request.url, env.TMDB_API_KEY);
      return new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600"
        }
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          message: error instanceof Error ? error.message : "Anime catalog failed"
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
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
