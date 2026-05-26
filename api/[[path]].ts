import { proxyProviderRequest } from "../shared/providerProxy";

export async function onRequest(context: {
  request: Request;
  env: { VITE_CONVEX_SITE_URL?: string; CONVEX_SITE_URL?: string };
  params: { path: string[] };
}) {
  const { request, env, params } = context;
  const path = params.path ?? [];

  if (path[0] === "vidplays" || path[0] === "vidplays-proxy") {
    const providerProxyUrl = new URL(request.url);
    providerProxyUrl.pathname = `/${
      path[0] === "vidplays" ? ["vidplays-proxy", ...path.slice(1)].join("/") : path.join("/")
    }`;

    return proxyProviderRequest({
      url: providerProxyUrl,
      method: request.method,
      headers: request.headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
    });
  }

  const siteUrl = env.VITE_CONVEX_SITE_URL ?? "";
  if (!siteUrl) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Server misconfiguration: VITE_CONVEX_SITE_URL is not set."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const base = siteUrl.replace(/\/$/, "");
  const subpath = params.path ? params.path.join("/") : "";
  const url = new URL(request.url);
  const target = `${base}/api/${subpath}${url.search}`;

  const proxied = new Request(target, {
    method: request.method,
    headers: request.headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
  });

  return fetch(proxied);
}
