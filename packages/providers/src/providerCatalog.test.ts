import { describe, expect, it } from "vitest";
import { buildTvSources, getProviderByKey, getProviderByOrigin } from "./providerCatalog";

describe("providerCatalog", () => {
  it("uses explicit provider origins when a website has an absolute URL", () => {
    const provider = getProviderByKey("peachify");

    expect(provider?.progress?.origins).toEqual(["https://peachify.top"]);
    expect(provider?.progress?.unsafeWildcardOrigin).toBe(false);
  });

  it("keeps relative proxy providers marked as unsafe wildcard origins", () => {
    const provider = getProviderByKey("vidplays");

    expect(provider?.progress?.origins).toEqual(["*"]);
    expect(provider?.progress?.unsafeWildcardOrigin).toBe(true);
  });

  it("finds a provider by explicit origin", () => {
    expect(getProviderByOrigin("https://vidcore.net")?.key).toBe("vidcore");
  });

  it("uses stored AniList episode mappings for anime provider URLs", async () => {
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
});
