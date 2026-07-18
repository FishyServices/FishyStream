export interface ProviderProxyMatch {
  prefix: string;
  subpath: string;
}

export interface ProviderProxyRequest {
  url: URL;
  method?: string;
  headers?: Headers;
  body?: BodyInit | null;
}

export interface ProviderProxyAdapter {
  prefix: string;
  handle(request: ProviderProxyRequest & { subpath: string }): Promise<Response>;
}

export const PROVIDER_PROXY_PREFIXES = ["vidplays-proxy"] as const;
export const PROVIDER_PROXY_PATH_ALIASES: Record<string, (segments: string[]) => string[]> = {
  vidplays: (segments) => ["vidplays-proxy", ...segments.slice(1)]
};

export function matchProviderProxyPath(pathname: string): ProviderProxyMatch | null {
  const normalized = pathname.replace(/^\/+/, "");
  const [prefix, ...rest] = normalized.split("/");

  if (!prefix) return null;
  if (!PROVIDER_PROXY_PREFIXES.some((candidate) => candidate === prefix)) return null;

  return {
    prefix,
    subpath: rest.join("/")
  };
}

export function resolveProviderProxyPathFromSegments(segments: readonly string[]): string | null {
  const [prefix] = segments;
  if (!prefix) return null;

  const normalizedSegments = PROVIDER_PROXY_PREFIXES.some((candidate) => candidate === prefix)
    ? [...segments]
    : (PROVIDER_PROXY_PATH_ALIASES[prefix]?.([...segments]) ?? null);

  if (!normalizedSegments) return null;
  return `/${normalizedSegments.join("/")}`;
}

export async function proxyProviderRequest({
  url,
  method = "GET",
  headers = new Headers(),
  body
}: ProviderProxyRequest): Promise<Response> {
  const match = matchProviderProxyPath(url.pathname);
  if (!match) return new Response("Unknown provider proxy", { status: 404 });
  const adapter = PROVIDER_PROXY_ADAPTERS.find((candidate) => candidate.prefix === match.prefix);

  if (!adapter) return new Response("Unknown provider proxy", { status: 404 });

  return adapter.handle({
    url,
    subpath: match.subpath,
    method,
    headers,
    body
  });
}

const vidPlaysProxyAdapter: ProviderProxyAdapter = {
  prefix: "vidplays-proxy",
  handle: proxyVidPlaysRequest
};

const PROVIDER_PROXY_ADAPTERS: ProviderProxyAdapter[] = [vidPlaysProxyAdapter];

async function proxyVidPlaysRequest({
  url,
  subpath,
  method,
  headers = new Headers(),
  body
}: ProviderProxyRequest & { subpath: string }) {
  if (subpath === "hls") {
    return proxyVidPlaysHls(url);
  }

  const target = `https://vidplays.fun/${subpath}${url.search}`;
  const upstream = await fetch(target, {
    method,
    headers: {
      Accept: headers.get("Accept") ?? "*/*",
      "Accept-Language": headers.get("Accept-Language") ?? "en-US,en;q=0.9",
      Referer: "https://vidplays.fun/",
      Origin: "https://vidplays.fun"
    },
    body: method !== "GET" && method !== "HEAD" ? body : undefined
  });

  if (subpath === "player.js") {
    const script = await upstream.text();
    return new Response(
      script.replaceAll('"/api/stream_data?type="', '"/vidplays-proxy/api/stream_data?type="'),
      {
        status: upstream.status,
        headers: noStoreHeaders("application/javascript; charset=utf-8")
      }
    );
  }

  if (subpath.startsWith("embed/")) {
    const html = await upstream.text();
    return new Response(
      html
        .replaceAll(
          'window.HOST = "https://vidplays.fun";',
          `window.HOST = "${url.origin}/vidplays-proxy";`
        )
        .replaceAll('src="/player.js', 'src="/vidplays-proxy/player.js'),
      {
        status: upstream.status,
        headers: noStoreHeaders("text/html; charset=utf-8")
      }
    );
  }

  if (subpath === "api/stream_data") {
    const data = (await upstream.json()) as Record<string, unknown>;
    data.captions = [];
    rewriteVidPlaysStreamUrls(data, url.origin);
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: noStoreHeaders("application/json; charset=utf-8")
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
      headers: noStoreHeaders(contentType || "application/octet-stream")
    });
  }

  const playlist = await upstream.text();
  return new Response(rewriteHlsPlaylist(playlist, target, url.origin), {
    status: 200,
    headers: noStoreHeaders("application/vnd.apple.mpegurl; charset=utf-8")
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

function noStoreHeaders(contentType: string) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  };
}
