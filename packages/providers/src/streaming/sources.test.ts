import { describe, expect, it } from "vitest";
import { getProviderByKey, getProviderByOrigin } from "./registry.js";
import { buildMovieSources, buildTvSources, createSourceBuilder } from "./sources.js";

describe("provider registry", () => {
  it("derives explicit origins from the website", () => {
    expect(getProviderByKey("peachify")?.origins).toEqual(["https://peachify.top"]);
  });

  it("finds providers by origin", () => {
    expect(getProviderByOrigin("https://vidcore.io")?.key).toBe("vidcore");
    expect(getProviderByOrigin("https://vidfast.xyz")?.key).toBe("vidfast");
    expect(getProviderByOrigin("https://player.vidlove.cc")?.key).toBe("vidlove");
    expect(getProviderByOrigin("https://evil.example")).toBeUndefined();
  });

  it("uses VidZee's primary embed endpoints", () => {
    const provider = getProviderByKey("vidzee");
    expect(provider?.getMovieUrl("550")).toBe("https://player.vidzee.wtf/embed/movie/550");
    expect(provider?.getTVUrl("1399", 1, 1)).toBe("https://player.vidzee.wtf/embed/tv/1399/1/1");
  });
});

describe("source building", () => {
  it("uses anime episode routes for anime movies", async () => {
    const sources = await buildMovieSources({
      tmdbId: "569094",
      isAnime: true,
      anilistId: "151807",
      dub: true
    });

    expect(sources.find((source) => source.key === "aniembed")?.url).toBe(
      "https://aniembed.se/e/151807/1?lang=dub"
    );
    expect(sources.find((source) => source.key === "megavid")?.url).toBe(
      "https://megavid.buzz/ani/151807/1/dub"
    );
    expect(sources.find((source) => source.key === "vidhawk")?.url).toBe(
      "https://vidhawk.buzz/embed/ani/151807/1/dub"
    );
  });

  it("prefers stored AniList mappings for tv episodes", async () => {
    const sources = await buildTvSources({
      tmdbId: "1",
      isAnime: true,
      title: "Example Anime",
      season: 2,
      episode: 5,
      anilistId: "season-one-id",
      anilistEpisodeMappings: [{ episodeNumber: 5, anilistId: "178090", anilistEpisodeNumber: 5 }],
      dub: true
    });

    expect(sources.find((source) => source.key === "megaplay")?.url).toBe(
      "https://megaplay.buzz/stream/ani/178090/5/dub"
    );
    expect(sources.find((source) => source.server.id === "bcdn")?.url).toBe(
      "https://megaplay.buzz/stream/ani/178090/5/dub?s=bcdn"
    );
    expect(sources.find((source) => source.server.id === "tcdn")?.url).toBe(
      "https://megaplay.buzz/stream/ani/178090/5/dub?s=tcdn"
    );
    expect(sources.find((source) => source.key === "zokoanime")?.url).toBe(
      "https://zokoanime.video/stream/ani/178090/5/dub"
    );
  });

  it("skips anime providers when the AniList lookup fails", async () => {
    const builder = createSourceBuilder({
      getSeasonDetail: async () => null,
      resolveAddress: async () => null
    });
    const sources = await builder.buildTvSources({
      tmdbId: "1",
      imdbId: "tt1",
      isAnime: true,
      title: "Missing",
      season: 1,
      episode: 1
    });

    expect(sources.some((source) => source.key === "megaplay")).toBe(false);
    expect(sources.some((source) => source.key === "vidsrc")).toBe(true);
  });

  it("offsets absolute episode numbering for later seasons", async () => {
    const queries: Array<{ season: number; episode: number }> = [];
    const builder = createSourceBuilder({
      getSeasonDetail: async (_id, season) =>
        season === 1
          ? {
              episodes: Array.from({ length: 12 }, (_, i) => ({
                episodeNumber: i + 1,
                name: "",
                voteAverage: 0
              }))
            }
          : { episodes: [] },
      resolveAddress: async (query) => {
        queries.push({ season: query.season, episode: query.episode });
        return { anilistId: "9", episode: query.episode };
      }
    });
    await builder.buildTvSources({ tmdbId: "5", isAnime: true, title: "X", season: 2, episode: 3 });

    expect(queries[0]).toEqual({ season: 1, episode: 15 });
  });

  it("adds the direct source for overridden episodes", async () => {
    const sources = await buildTvSources({ tmdbId: "74018", season: 2, episode: 1 });
    expect(sources[0]).toMatchObject({
      key: "direct",
      url: "https://ok.ru/videoembed/4084616465042"
    });
  });
});
