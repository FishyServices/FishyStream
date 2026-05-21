//
//import { httpRouter } from "convex/server";
//import { httpAction } from "./_generated/server";
//
//const http = httpRouter();
//
//const providerMap: Record<string, string> = {
//  vidnest: "https://vidnest.fun",
//  "vidnest-new": "https://new.vidnest.fun",
//  vidrock: "https://vidrock.ru",
//  vidplus: "https://player.vidplus.to",
//  filmu: "https://embed.filmu.in",
//  videasy: "https://player.videasy.net",
//  vidking: "https://www.vidking.net",
//  vidfast: "https://vidfast.pro",
//  vidzen: "https://vidzen.fun",
//  vixsrc: "https://vixsrc.to",
//  "vidsrc-pro": "https://vidsrc.mov",
//  cinezo: "https://player.cinezo.live",
//  mafiaembed: "https://nhdapi.com",
//  superembed: "https://www.multiembed.mov",
//  autoembed: "https://player.autoembed.cc",
//  vidsrc: "https://vidsrc.icu",
//  "2embed": "https://www.2embed.cc",
//  vidzee: "https://player.vidzee.wtf",
//  "111movies": "https://111movies.net",
//  vidplays: "https://vidplays.fun",
//  tryembed: "https://tryembed.us.cc",
//  megaplay: "https://megaplay.buzz",
//  vidcore: "https://vidcore.net",
//  peachify: "https://peachify.top",
//  cinesrc: "https://cinesrc.st"
//};
//
//function rewriteHtml(html: string, baseUrl: string, proxyPrefix: string): string {
//  const origin = new URL(baseUrl).origin;
//
//  const rewriteAbsoluteUrl = (url: string): string => {
//    if (url.startsWith(origin)) {
//      const path = url.slice(origin.length);
//      return `${proxyPrefix}${path}`;
//    }
//    return url;
//  };
//
//  return html
//    .replace(/((?:src|href|action)=["'])([^"']+)(["'])/g, (_, pre, url, post) => {
//      if (url.startsWith("//")) {
//        return `${pre}https:${url}${post}`;
//      }
//      if (url.startsWith("/") && !url.startsWith("//")) {
//        return `${pre}${proxyPrefix}${url}${post}`;
//      }
//      return `${pre}${rewriteAbsoluteUrl(url)}${post}`;
//    })
//    .replace(/url\(["']?([^"')]+)["']?\)/g, (_, url) => {
//      if (url.startsWith("/") && !url.startsWith("//")) {
//        return `url(${proxyPrefix}${url})`;
//      }
//      return `url(${rewriteAbsoluteUrl(url)})`;
//    })
//    .replace(
//      /(["'`])(\/(?:_next|assets|static|js|css|images|fonts|media|public)\/[^"'`\s]+)(["'`])/g,
//      (_, q1, path, q2) => `${q1}${proxyPrefix}${path}${q2}`
//    );
//}
//
//const streamProxy = httpAction(async (_, request) => {
//  const url = new URL(request.url);
//
//  const stripped = url.pathname.replace(/^\/api\/stream\//, "");
//  const parts = stripped.split("/").filter(Boolean);
//
//  const providerName = parts.shift();
//  if (!providerName) {
//    return new Response(JSON.stringify({ success: false, message: "No provider specified" }), {
//      status: 400,
//      headers: { "Content-Type": "application/json" }
//    });
//  }
//
//  const baseUrl = providerMap[providerName];
//  if (!baseUrl) {
//    return new Response(JSON.stringify({ success: false, message: "Unknown provider" }), {
//      status: 400,
//      headers: { "Content-Type": "application/json" }
//    });
//  }
//
//  const restPath = parts.join("/");
//  const targetUrl = `${baseUrl}/${restPath}${url.search}`;
//
//  const proxyPrefix = `${url.protocol}//${url.host}/api/stream/${providerName}`;
//
//  const forwardHeaders = new Headers();
//  forwardHeaders.set("referer", `${baseUrl}/`);
//  forwardHeaders.set("origin", baseUrl);
//  forwardHeaders.set("user-agent", request.headers.get("user-agent") || "Mozilla/5.0");
//  forwardHeaders.set("accept", request.headers.get("accept") || "*/*");
//  forwardHeaders.set("accept-language", request.headers.get("accept-language") || "en-US,en;q=0.9");
//  forwardHeaders.set("accept-encoding", "identity");
//
//  const rangeHeader = request.headers.get("range");
//  if (rangeHeader) {
//    forwardHeaders.set("range", rangeHeader);
//  }
//
//  try {
//    const response = await fetch(targetUrl, {
//      method: request.method,
//      headers: forwardHeaders,
//      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
//      redirect: "follow"
//    });
//
//    const contentType = response.headers.get("content-type") || "";
//
//    const responseHeaders = new Headers();
//    responseHeaders.set("Access-Control-Allow-Origin", "*");
//    responseHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
//    responseHeaders.set(
//      "Access-Control-Allow-Headers",
//      "Content-Type, Authorization, X-Requested-With, Origin, Range"
//    );
//    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range");
//    responseHeaders.set("Vary", "Origin");
//
//    const skipHeaders = new Set([
//      "x-frame-options",
//      "content-security-policy",
//      "content-security-policy-report-only",
//      "access-control-allow-origin",
//      "access-control-allow-methods",
//      "access-control-allow-headers",
//      "access-control-expose-headers",
//      "transfer-encoding",
//      "strict-transport-security"
//    ]);
//
//    response.headers.forEach((value, key) => {
//      if (!skipHeaders.has(key.toLowerCase())) {
//        responseHeaders.set(key, value);
//      }
//    });
//
//    if (contentType.includes("text/html")) {
//      const html = await response.text();
//      const rewritten = rewriteHtml(html, baseUrl, proxyPrefix);
//      responseHeaders.set("content-type", "text/html; charset=utf-8");
//      responseHeaders.delete("content-length");
//      return new Response(rewritten, {
//        status: response.status,
//        statusText: response.statusText,
//        headers: responseHeaders
//      });
//    }
//
//    if (
//      contentType.includes("text/css") ||
//      contentType.includes("javascript") ||
//      contentType.includes("text/plain")
//    ) {
//      const text = await response.text();
//      const rewritten = text.replace(
//        /url\(["']?(\/[^"')]+)["']?\)/g,
//        (_, path) => `url(${proxyPrefix}${path})`
//      );
//      responseHeaders.set("content-type", contentType);
//      responseHeaders.delete("content-length");
//      return new Response(rewritten, {
//        status: response.status,
//        statusText: response.statusText,
//        headers: responseHeaders
//      });
//    }
//
//    return new Response(response.body, {
//      status: response.status,
//      statusText: response.statusText,
//      headers: responseHeaders
//    });
//  } catch (error) {
//    return new Response(
//      JSON.stringify({ success: false, message: "Stream proxy failed", error: String(error) }),
//      { status: 502, headers: { "Content-Type": "application/json" } }
//    );
//  }
//});
//
//const preflightHandler = httpAction(async () => {
//  return new Response(null, {
//    headers: {
//      "Access-Control-Allow-Origin": "*",
//      "Access-Control-Allow-Methods": "GET, OPTIONS",
//      "Access-Control-Allow-Headers":
//        "Content-Type, Authorization, X-Requested-With, Origin, Range",
//      "Access-Control-Max-Age": "86400"
//    }
//  });
//});
//
//http.route({
//  pathPrefix: "/api/stream/",
//  method: "GET",
//  handler: streamProxy
//});
//
//http.route({
//  pathPrefix: "/api/stream/",
//  method: "OPTIONS",
//  handler: preflightHandler
//});
//
//export default http;
//
