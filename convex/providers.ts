import { v } from "convex/values";
import { action } from "./_generated/server";
import { resolveAniListId } from "../shared/anilistResolver";
import { STREAM_PROVIDERS, getProviderId } from "../shared/providerCatalog";
import { mapCanonicalToProviderOrder } from "../shared/tvSeasonMappings";

interface StreamSource {
  key: string;
  name: string;
  url: string;
  quality: string;
}

function dedupeSources(sources: StreamSource[]) {
  const seen = new Set<string>();
  const result: StreamSource[] = [];

  for (const source of sources) {
    const key = `${source.key}:${source.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(source);
  }

  return result;
}

export const listMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    const sources = STREAM_PROVIDERS.flatMap((provider) => {
      if (provider.animeOnly) return [];

      const id = getProviderId(provider, imdbId, tmdbId);
      if (!id) return [];

      return [
        {
          key: provider.key,
          name: provider.name,
          url: provider.getMovieUrl(id),
          quality: provider.quality
        }
      ];
    });

    return dedupeSources(sources);
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
    let resolvedAniListId: string | null | undefined = undefined;

    const sources = [];
    for (const provider of STREAM_PROVIDERS) {
      if (provider.animeOnly && !isAnime) continue;

      const fallbackId = getProviderId(provider, imdbId, tmdbId);
      let animeId = fallbackId;

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

      const id = animeId ?? fallbackId;
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

    return dedupeSources(sources);
  }
});
