import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { matchProviderProxyPath, proxyProviderRequest } from "./shared/providerProxy";

function vidplaysProxyPlugin(): Plugin {
  return {
    name: "vidplays-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        if (!matchProviderProxyPath(requestUrl.pathname)) {
          next();
          return;
        }

        try {
          const response = await proxyProviderRequest({
            url: requestUrl,
            method: req.method ?? "GET",
            headers: new Headers(req.headers as HeadersInit)
          });

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
