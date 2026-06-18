"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  buildAniListEpisodeMappings,
  buildCanonicalSeasonPayload,
  resolveSeasonAniListId
} from "@fishy/providers/tmdb";

export const syncAnimeSeasonPlaybackMeta = action({
  args: {
    contentId: v.string(),
    tmdbId: v.string(),
    title: v.string(),
    seasonNumber: v.number()
  },
  handler: async (ctx, args) => {
    const payload = await buildCanonicalSeasonPayload(args.tmdbId, args.seasonNumber);
    if (!payload) return null;

    const anilistId = await resolveSeasonAniListId({
      title: args.title,
      seasonNumber: payload.seasonNumber,
      seasonTitle: payload.name,
      year: payload.year
    });
    const mappings = await buildAniListEpisodeMappings({
      anilistId,
      title: args.title,
      season: payload.seasonNumber,
      seasonTitle: payload.name,
      year: payload.year,
      episodes: payload.episodes
    });

    await ctx.runMutation(internal.seasons.upsertAnimeSeasonMeta, {
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      seasonNumber: payload.seasonNumber,
      name: payload.name,
      overview: payload.overview,
      airDate: payload.airDate,
      episodeCount: payload.episodeCount,
      anilistId: anilistId ?? undefined,
      anilistEpisodeMappings: mappings,
      episodes: payload.episodes
    });

    return {
      seasonNumber: payload.seasonNumber,
      name: payload.name,
      airDate: payload.airDate,
      episodeCount: payload.episodeCount,
      anilistId: anilistId ?? undefined,
      anilistEpisodeMappingCount: mappings?.length,
      anilistEpisodeMappings: mappings
    };
  }
});
