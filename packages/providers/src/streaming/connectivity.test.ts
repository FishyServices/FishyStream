import { describe, expect, it } from "vitest";
import { STREAM_PROVIDERS } from "./registry.js";

const MOVIE_ID = "550";
const TV_ID = "1399";

async function isReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const headers = { "User-Agent": "Mozilla/5.0" };
  try {
    let response = await fetch(url, { method: "HEAD", headers, signal: controller.signal });
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    }
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

describe.runIf(process.env.PROVIDER_CONNECTIVITY === "1")("provider connectivity", () => {
  for (const provider of STREAM_PROVIDERS) {
    it(`${provider.key} responds`, async () => {
      const movieUrl = provider.getMovieUrl(MOVIE_ID);
      const tvUrl = provider.getTVUrl(TV_ID, 1, 1);
      expect(movieUrl.startsWith(provider.website ?? "")).toBe(true);
      expect(tvUrl.startsWith(provider.website ?? "")).toBe(true);
      expect(await Promise.all([isReachable(movieUrl), isReachable(tvUrl)])).toEqual([true, true]);
    });
  }
});
