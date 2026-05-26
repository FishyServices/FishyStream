import { v } from "convex/values";
import { action } from "./_generated/server";
import { buildMovieSources, buildTvSources } from "../shared/providerCatalog";
import type { StreamSource } from "../shared/providerCatalog";

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
    dub: v.optional(v.boolean())
  },
  handler: async (
    _ctx,
    { imdbId, tmdbId, anilistId, season, episode, isAnime, title, seasonTitle, year, dub }
  ): Promise<StreamSource[]> => {
    return buildTvSources({
      imdbId,
      tmdbId,
      anilistId,
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
