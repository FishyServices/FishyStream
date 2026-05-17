import { v } from "convex/values";
import { action } from "./_generated/server";
import { mapCanonicalToProviderOrder } from "../shared/tvSeasonMappings";
import { STREAM_PROVIDERS, getProviderId } from "../shared/providerCatalog";
import { resolveAniListId } from "../shared/anilistResolver";

interface StreamSource {
  key: string;
  name: string;
  url: string;
  quality: string;
}

export const listMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];

    for (const provider of STREAM_PROVIDERS) {
      if (provider.animeOnly) continue;

      const id = getProviderId(provider, imdbId, tmdbId);
      if (!id) continue;

      sources.push({
        key: provider.key,
        name: provider.name,
        url: provider.getMovieUrl(id),
        quality: provider.quality
      });
    }

    return sources;
  }
});

export const listTvSources = action({
  args: {
    imdbId: v.optional(v.string()),
    isAnime: v.optional(v.boolean()),
    season: v.number(),
    episode: v.number(),
    title: v.optional(v.string()),
    seasonTitle: v.optional(v.string()),
    year: v.optional(v.number()),
    tmdbId: v.optional(v.string()),
    anilistId: v.optional(v.string()),
    dub: v.optional(v.boolean())
  },
  handler: async (
    _ctx,
    { imdbId, tmdbId, anilistId, season, episode, isAnime, title, seasonTitle, year, dub }
  ): Promise<StreamSource[]> => {
    const sources: StreamSource[] = [];
    let resolvedAniListId: string | null | undefined = undefined;

    for (const provider of STREAM_PROVIDERS) {
      if (provider.animeOnly && !isAnime) continue;

      const defaultId = getProviderId(provider, imdbId, tmdbId);
      let animeId = defaultId;

      if (isAnime && provider.getAnimeTVUrl && provider.animeIdType === "anilist") {
        if (resolvedAniListId === undefined) {
          resolvedAniListId =
            (title
              ? await resolveAniListId({
                  title,
                  season,
                  seasonTitle,
                  year
                })
              : null) ??
            anilistId ??
            null;
        }
        animeId = resolvedAniListId;
      }

      const id = animeId ?? defaultId;
      if (!id) continue;
      const mapped = mapCanonicalToProviderOrder(tmdbId, provider.name, { season, episode });
      const url =
        isAnime && provider.getAnimeTVUrl && animeId
          ? provider.getAnimeTVUrl(id, mapped.season, mapped.episode, dub ?? false)
          : provider.getTVUrl(id, mapped.season, mapped.episode);

      sources.push({
        key: provider.key,
        name: provider.name,
        url,
        quality: provider.quality
      });
    }

    return sources;
  }
});
