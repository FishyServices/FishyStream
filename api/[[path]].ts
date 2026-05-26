export async function onRequest(context: {
  request: Request;
  env: { VITE_CONVEX_SITE_URL?: string; CONVEX_SITE_URL?: string };
  params: { path: string[] };
}) {
  const { request, env, params } = context;
  const path = params.path ?? [];

  if (path[0] === "vidplays" || path[0] === "vidplays-proxy") {
    return proxyVidPlays(request, path.slice(1));
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

async function proxyVidPlays(request: Request, path: string[]) {
  const url = new URL(request.url);
  const subpath = path.join("/");

  if (subpath === "hls") {
    return proxyVidPlaysHls(url);
  }

  const target = `https://vidplays.fun/${subpath}${url.search}`;
  const upstream = await fetch(target, {
    method: request.method,
    headers: {
      Accept: request.headers.get("Accept") ?? "*/*",
      "Accept-Language": request.headers.get("Accept-Language") ?? "en-US,en;q=0.9",
      Referer: "https://vidplays.fun/",
      Origin: "https://vidplays.fun"
    },
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined
  });

  if (subpath === "player.js") {
    const script = await upstream.text();
    return new Response(
      script.replaceAll('"/api/stream_data?type="', '"/vidplays-proxy/api/stream_data?type="'),
      {
        status: upstream.status,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  if (subpath.startsWith("embed/")) {
    const origin = url.origin;
    const html = await upstream.text();
    return new Response(
      html
        .replaceAll(
          'window.HOST = "https://vidplays.fun";',
          `window.HOST = "${origin}/vidplays-proxy";`
        )
        .replaceAll('src="/player.js', 'src="/vidplays-proxy/player.js'),
      {
        status: upstream.status,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  if (subpath === "api/stream_data") {
    const data = (await upstream.json()) as Record<string, unknown>;
    data.captions = [];
    rewriteVidPlaysStreamUrls(data, url.origin);
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers
  });
}

async function proxyVidPlaysHls(url: URL) {
  const target = url.searchParams.get("url");
  if (!target?.startsWith("https://")) {
    return new Response("Missing HLS URL", { status: 400 });
  }

  const upstream = await fetch(target, {
    headers: {
      Accept: "*/*",
      Referer: "https://videostr.net/",
      Origin: "https://videostr.net"
    }
  });

  const contentType = upstream.headers.get("Content-Type") ?? "";
  if (!contentType.includes("mpegurl") && !target.includes(".m3u8")) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": contentType || "application/octet-stream",
        "Cache-Control": "no-store"
      }
    });
  }

  const playlist = await upstream.text();
  return new Response(rewriteHlsPlaylist(playlist, target, url.origin), {
    status: upstream.status,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function rewriteVidPlaysStreamUrls(value: unknown, origin: string): unknown {
  if (Array.isArray(value)) {
    value.forEach((entry) => rewriteVidPlaysStreamUrls(entry, origin));
    return value;
  }

  if (!value || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  for (const [key, entry] of Object.entries(record)) {
    if ((key === "url" || key === "streamUrl") && typeof entry === "string") {
      record[key] = toVidPlaysHlsProxyUrl(entry, origin);
    } else {
      rewriteVidPlaysStreamUrls(entry, origin);
    }
  }

  return value;
}

function toVidPlaysHlsProxyUrl(rawUrl: string, origin: string) {
  let target = rawUrl;
  try {
    const url = new URL(rawUrl);
    target = url.searchParams.get("u") ?? rawUrl;
  } catch {}

  return `${origin}/vidplays-proxy/hls?url=${encodeURIComponent(target)}`;
}

function rewriteHlsPlaylist(playlist: string, playlistUrl: string, origin: string) {
  return playlist
    .split("\n")
    .map((line) => {
      const uriMatch = line.match(/URI="([^"]+)"/);
      if (uriMatch?.[1]) {
        const nextUrl = new URL(uriMatch[1], playlistUrl).toString();
        return line.replace(uriMatch[1], toVidPlaysHlsProxyUrl(nextUrl, origin));
      }

      if (!line || line.startsWith("#")) return line;
      const nextUrl = new URL(line, playlistUrl).toString();
      return toVidPlaysHlsProxyUrl(nextUrl, origin);
    })
    .join("\n");
}
