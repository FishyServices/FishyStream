import { v } from "convex/values";
import { action } from "./_generated/server";
import { buildMovieSources, buildTvSources } from "@fishy/providers/providerCatalog";
import type { StreamSource } from "@fishy/providers/providerCatalog";
import type { AniListEpisodeMapping } from "@fishy/providers/types";

const anilistEpisodeMappingValidator = v.object({
  episodeNumber: v.number(),
  anilistId: v.string(),
  anilistEpisodeNumber: v.number()
});

export const listMovieSources = action({
  args: {
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string())
  },
  handler: async (_ctx, { imdbId, tmdbId }): Promise<StreamSource[]> => {
    return buildMovieSources({ imdbId, tmdbId });
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
    anilistEpisodeMappings: v.optional(v.array(anilistEpisodeMappingValidator)),
    dub: v.optional(v.boolean())
  },
  handler: async (
    _ctx,
    {
      imdbId,
      tmdbId,
      anilistId,
      anilistEpisodeMappings,
      season,
      episode,
      isAnime,
      title,
      seasonTitle,
      year,
      dub
    }
  ): Promise<StreamSource[]> => {
    return buildTvSources({
      imdbId,
      tmdbId,
      anilistId,
      anilistEpisodeMappings: anilistEpisodeMappings as AniListEpisodeMapping[] | undefined,
      season,
      episode,
      isAnime,
      title,
      seasonTitle,
      year,
      dub
    });
  }
});
