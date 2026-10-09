import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync, existsSync } from "fs";
import { fetchAnimeCatalog } from "./packages/providers/src/anime/anilist/index.ts";
import { handleOpenSubtitlesRequest } from "./packages/providers/src/subtitles/index.ts";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const devDeps = Object.keys(pkg.devDependencies ?? {});

function fishyProvidersPlugin(): Plugin {
  const providersRoot = path.resolve(import.meta.dirname, "./packages/providers/src");
  return {
    name: "fishy-providers",
    enforce: "pre",
    resolveId(source) {
      const match = source.match(/^@fishy\/providers(\/(.+))?$/);
      if (!match) return null;
      const subpath = match[2] ?? "index";
      const flat = path.resolve(providersRoot, `${subpath}.ts`);
      const folderIndex = path.resolve(providersRoot, subpath, "index.ts");
      if (!existsSync(flat) && existsSync(folderIndex)) return folderIndex;
      return flat;
    }
  };
}

function fishyAnimeApiPlugin(apiKey: string | undefined): Plugin {
  return {
    name: "fishy-anime-api",
    configureServer(server) {
      server.middlewares.use("/api/anime", async (request, response, next) => {
        if (request.method !== "GET") {
          next();
          return;
        }

        if (!apiKey) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ message: "TMDB_API_KEY is not configured" }));
          return;
        }

        try {
          const result = await fetchAnimeCatalog(
            `http://${request.headers.host ?? "localhost"}${request.url ?? "/api/anime"}`,
            apiKey
          );
          response.statusCode = 200;
          response.setHeader("Content-Type", "application/json");
          response.setHeader("Cache-Control", "no-store");
          response.end(JSON.stringify(result));
        } catch (error) {
          response.statusCode = 502;
          response.setHeader("Content-Type", "application/json");
          response.end(
            JSON.stringify({
              message: error instanceof Error ? error.message : "Anime catalog failed"
            })
          );
        }
      });
    }
  };
}

function fishySubtitlesApiPlugin(): Plugin {
  return {
    name: "fishy-subtitles-api",
    configureServer(server) {
      server.middlewares.use("/api/subtitles", async (request, response) => {
        const requestUrl = request.url ?? "/";
        const mountedPath = requestUrl.startsWith("/api/subtitles")
          ? requestUrl
          : `/api/subtitles${requestUrl === "/" ? "" : requestUrl}`;
        const target = new URL(mountedPath, `http://${request.headers.host ?? "localhost"}`);
        const result = await handleOpenSubtitlesRequest(
          new Request(target, { method: request.method })
        );
        response.statusCode = result.status;
        result.headers.forEach((value, key) => response.setHeader(key, value));
        response.end(Buffer.from(await result.arrayBuffer()));
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const convexSiteUrl = env.VITE_CONVEX_SITE_URL;
  return {
    plugins: [
      fishyProvidersPlugin(),
      fishyAnimeApiPlugin(env.TMDB_API_KEY),
      fishySubtitlesApiPlugin(),
      tailwindcss(),
      react()
    ],
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
        {
          find: "@fishy/scraper/client",
          replacement: path.resolve(import.meta.dirname, "./packages/scraper/src/client.ts")
        },
        { find: "@content", replacement: path.resolve(import.meta.dirname, "./shared/content") },
        { find: "react", replacement: path.resolve(import.meta.dirname, "./node_modules/react") },
        {
          find: "react-dom",
          replacement: path.resolve(import.meta.dirname, "./node_modules/react-dom")
        }
      ]
    },
    build: {
      target: "esnext",
      modulePreload: { polyfill: false },
      chunkSizeWarningLimit: 1000,
      minify: "esbuild",
      cssMinify: true,
      reportCompressedSize: false,
      rolldownOptions: {
        external: devDeps,
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false
        },
        output: {
          manualChunks(id) {
            if (id.includes("node_modules")) {
              if (id.includes("@clerk")) return "vendor-clerk";
              if (id.includes("lucide-react")) return "vendor-icons";
              if (id.includes("react") || id.includes("react-dom")) return "vendor-react";
              if (id.includes("@radix-ui")) return "vendor-ui";
              if (id.includes("hls.js")) return "vendor-hls";
              if (id.includes("convex")) return "vendor-convex";
              if (id.includes("react-router")) return "vendor-router";
              if (id.includes("@capacitor")) return "vendor-capacitor";
              return "vendor";
            }
          }
        }
      }
    },
    server: {
      proxy: {
        "/api/imdb": {
          target: "https://api.graphql.imdb.com",
          changeOrigin: true,
          rewrite: () => "/",
          headers: {
            Origin: "https://www.imdb.com",
            Referer: "https://www.imdb.com/"
          }
        },
        "/api": {
          target: convexSiteUrl,
          changeOrigin: true,
          secure: true
        }
      }
    }
  };
});
