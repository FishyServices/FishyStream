"use node";
import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  buildAniListEpisodeMappings,
  buildCanonicalSeasonPayload,
  resolveSeasonAniListId
} from "@fishy/providers/tmdb";

type SeasonPlaybackMetaResult = {
  seasonNumber: number;
  name: string;
  airDate?: string;
  episodeCount: number;
  anilistId?: string;
  anilistEpisodeMappingCount?: number;
  anilistEpisodeMappings?: Array<{
    episodeNumber: number;
    anilistId: string;
    anilistEpisodeNumber: number;
  }>;
};

export const syncAnimeSeasonPlaybackMeta = action({
  args: {
    contentId: v.string(),
    tmdbId: v.string(),
    title: v.string(),
    seasonNumber: v.number(),
    episodeNumber: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<SeasonPlaybackMetaResult | null> => {
    const cached: SeasonPlaybackMetaResult | null = await ctx.runQuery(
      internal.domains.seasons.seasons.getSeasonPlaybackMetaInternal,
      {
        contentId: args.contentId,
        seasonNumber: args.seasonNumber,
        episodeNumber: args.episodeNumber
      }
    );
    if (cached) return cached;

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

    await ctx.runMutation(internal.domains.seasons.seasons.upsertAnimeSeasonMeta, {
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
