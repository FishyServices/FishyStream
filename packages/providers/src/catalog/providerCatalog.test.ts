import { describe, expect, it } from "vitest";
import {
  STREAM_PROVIDERS,
  buildTvSources,
  getProviderByKey,
  getProviderByOrigin
} from "./providerCatalog.js";

describe("providerCatalog", () => {
  it("explicit origins", () => {
    const provider = getProviderByKey("peachify");
    expect(provider?.origins).toEqual(["https://peachify.top"]);
    expect(provider?.unsafeWildcardOrigin).toBe(false);
  });

  it("finds origin", () => {
    expect(getProviderByOrigin("https://vidcore.net")?.key).toBe("vidcore");
  });

  it("anilist mappings", async () => {
    const sources = await buildTvSources({
      tmdbId: "1",
      isAnime: true,
      title: "Example Anime",
      season: 2,
      episode: 5,
      anilistId: "season-one-id",
      anilistEpisodeMappings: [
        {
          episodeNumber: 5,
          anilistId: "178090",
          anilistEpisodeNumber: 5
        }
      ],
      dub: true
    });
    expect(sources.find((source) => source.key === "megaplay")?.url).toBe(
      "https://megaplay.buzz/stream/ani/178090/5/dub"
    );
  });

  describe("providers connectivity", () => {
    const TEST_MOVIE_ID = "550";
    const TEST_TV_ID = "1399";
    const TEST_SEASON = 1;
    const TEST_EPISODE = 1;

    const validateUrl = async (url: string) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        let res = await fetch(url, {
          method: "HEAD",
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: controller.signal
        });
        if (res.status === 405 || res.status === 501) {
          res = await fetch(url, {
            method: "GET",
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: controller.signal
          });
        }
        return res.status < 500;
      } catch (error) {
        console.error(`Failed to validate ${url}:`, error);
        return false;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    for (const provider of STREAM_PROVIDERS) {
      if (provider.key === "direct") continue;

      describe(`${provider.key}`, () => {
        it("movie url", async () => {
          const movieUrl = provider.getMovieUrl(TEST_MOVIE_ID);
          expect(movieUrl).toBeTypeOf("string");
          expect(movieUrl.length).toBeGreaterThan(0);

          if (provider.website) {
            expect(movieUrl).toContain(provider.website.replace(/\/+$/, ""));
          }

          const isValid = await validateUrl(movieUrl);
          expect(isValid).toBe(true);
        });

        it("tv url", async () => {
          const tvUrl = provider.getTVUrl(TEST_TV_ID, TEST_SEASON, TEST_EPISODE);
          expect(tvUrl).toBeTypeOf("string");
          expect(tvUrl.length).toBeGreaterThan(0);

          if (provider.website) {
            expect(tvUrl).toContain(provider.website.replace(/\/+$/, ""));
          }

          const isValid = await validateUrl(tvUrl);
          expect(isValid).toBe(true);
        });

        it("http request", async () => {
          const movieUrl = provider.getMovieUrl(TEST_MOVIE_ID);
          const tvUrl = provider.getTVUrl(TEST_TV_ID, TEST_SEASON, TEST_EPISODE);

          const [movieWorking, tvWorking] = await Promise.all([
            validateUrl(movieUrl),
            validateUrl(tvUrl)
          ]);

          expect(movieWorking).toBe(true);
          expect(tvWorking).toBe(true);
        });
      });
    }
  });
});
