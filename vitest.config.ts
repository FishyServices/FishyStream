import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: `${r("./src")}/$1` },
      { find: /^@fishy\/providers$/, replacement: r("./packages/providers/src/index.ts") },
      { find: /^@fishy\/providers\/tmdb$/, replacement: r("./packages/providers/src/tmdb/index.ts") },
      { find: /^@fishy\/providers\/(.*)$/, replacement: `${r("./packages/providers/src")}/$1.ts` }
    ]
  },
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.{git,cache,output,temp}/**"]
  }
});
