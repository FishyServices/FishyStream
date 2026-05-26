import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

function vidplaysProxyPlugin(): Plugin {
  return {
    name: "vidplays-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        if (!requestUrl.pathname.startsWith("/vidplays-proxy")) {
          next();
          return;
        }

        try {
          const response = await proxyVidPlaysRequest(
            requestUrl.pathname.replace(/^\/vidplays-proxy\/?/, ""),
            requestUrl.search,
            req.method ?? "GET"
          );

          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(error instanceof Error ? error.message : "VidPlays proxy failed");
        }
      });
    }
  };
}

async function proxyVidPlaysRequest(subpath: string, search: string, method: string) {
  const requestUrl = new URL(`http://localhost/vidplays-proxy/${subpath}${search}`);

  if (subpath === "hls") {
    return proxyVidPlaysHls(requestUrl);
  }

  const target = `https://vidplays.fun/${subpath}${search}`;
  const upstream = await fetch(target, {
    method,
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: "https://vidplays.fun/",
      Origin: "https://vidplays.fun"
    }
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
    const html = await upstream.text();
    return new Response(
      html
        .replaceAll('window.HOST = "https://vidplays.fun";', 'window.HOST = "/vidplays-proxy";')
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
    rewriteVidPlaysStreamUrls(data, "");
    return new Response(JSON.stringify(data), {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  return upstream;
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
  return new Response(rewriteHlsPlaylist(playlist, target, ""), {
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const convexSiteUrl = env.VITE_CONVEX_SITE_URL;

  return {
    plugins: [vidplaysProxyPlugin(), tailwindcss(), react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@fishy/ui": path.resolve(__dirname, "./node_modules/@fishy/ui/src/index.ts"),
        react: path.resolve(__dirname, "./node_modules/react"),
        "react-dom": path.resolve(__dirname, "./node_modules/react-dom")
      }
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("@clerk")) return "vendor-clerk";
              if (id.includes("lucide-react")) return "vendor-icons";
              if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
              if (id.includes("@radix-ui")) return "vendor-ui";
              return "vendor";
            }
          }
        }
      }
    },
    server: {
      proxy: {
        "/api": {
          target: convexSiteUrl,
          changeOrigin: true,
          secure: true
        }
      }
    }
  };
});
