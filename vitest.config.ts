import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${r("./src")}/$1` },
      { find: /^@fishy\/providers$/, replacement: r("./packages/providers/src/index.ts") },
      {
        find: /^@fishy\/providers\/tmdb$/,
        replacement: r("./packages/providers/src/tmdb/index.ts")
      },
      {
        find: /^@fishy\/providers\/catalog$/,
        replacement: r("./packages/providers/src/catalog/index.ts")
      },
      {
        find: /^@fishy\/providers\/playback$/,
        replacement: r("./packages/providers/src/playback/index.ts")
      },
      {
        find: /^@fishy\/providers\/anime$/,
        replacement: r("./packages/providers/src/anime/index.ts")
      },
      {
        find: /^@fishy\/providers\/proxy$/,
        replacement: r("./packages/providers/src/proxy/index.ts")
      },
      { find: /^@fishy\/providers\/(.*)$/, replacement: `${r("./packages/providers/src")}/$1.ts` }
    ]
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.{git,cache,output,temp}/**"]
  }
});
