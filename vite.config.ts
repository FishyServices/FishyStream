import { defineConfig, loadEnv, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync, existsSync } from "fs";
import { pathToFileURL } from "url";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));
const devDeps = Object.keys(pkg.devDependencies ?? {});

function fishyProvidersPlugin(): Plugin {
  const providersRoot = path.resolve(__dirname, "./packages/providers/src");
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const convexSiteUrl = env.VITE_CONVEX_SITE_URL;
  return {
    plugins: [fishyProvidersPlugin(), tailwindcss(), react()],
    resolve: {
      alias: [
        { find: "@", replacement: path.resolve(__dirname, "./src") },
        { find: "@content", replacement: path.resolve(__dirname, "./shared/content") },
        {
          find: "@fishy/ui",
          replacement: path.resolve(__dirname, "./node_modules/@fishy/ui/src/index.ts")
        },
        { find: "react", replacement: path.resolve(__dirname, "./node_modules/react") },
        { find: "react-dom", replacement: path.resolve(__dirname, "./node_modules/react-dom") }
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
              if (id.includes("posthog")) return "vendor-posthog";
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
        "/api": {
          target: convexSiteUrl,
          changeOrigin: true,
          secure: true
        }
      }
    }
  };
});
