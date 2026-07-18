import {
  proxyProviderRequest,
  resolveProviderProxyPathFromSegments
} from "../../../packages/providers/src/proxy/providerProxy";

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

export async function handleProviderProxyRequest(context: PagesFunctionContext, prefix?: string) {
  const { request, params } = context;
  const segments = prefix ? [prefix, ...getSegments(params.path)] : getSegments(params.path);
  const providerProxyPath = resolveProviderProxyPathFromSegments(segments);

  if (!providerProxyPath) {
    return new Response("Unknown provider proxy", { status: 404 });
  }

  const providerProxyUrl = new URL(request.url);
  providerProxyUrl.pathname = providerProxyPath;

  return proxyProviderRequest({
    url: providerProxyUrl,
    method: request.method,
    headers: request.headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
  });
}

import scraperApp from "@fishy/scraper";
import puppeteer from "@cloudflare/puppeteer";

export async function handleApiRequest(context: PagesFunctionContext) {
  const { request, env, params } = context;
  const path = getSegments(params.path);
  const subpath = path.join("/");

  if (subpath === "scrape" || subpath === "m3u8-proxy" || subpath === "ts-proxy") {
    return scraperApp.fetch(
      request,
      {
        ...env,
        launchBrowser: () => puppeteer.launch((env as any).MYBROWSER)
      },
      context as any
    );
  }

  const providerProxyPath = resolveProviderProxyPathFromSegments(path);
  if (providerProxyPath) {
    return handleProviderProxyRequest(context);
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
