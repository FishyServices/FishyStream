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

function isAniListError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("AniList API");
}

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

    await ctx.runMutation(internal.domains.seasons.seasons.deleteAnimeSeasonMeta, {
      contentId: args.contentId,
      seasonNumber: args.seasonNumber
    });

    const payload = await buildCanonicalSeasonPayload(args.tmdbId, args.seasonNumber);
    if (!payload) return null;

    const episodes = payload.episodes.map((episode) => ({
      ...episode,
      runtime: episode.runtime ?? undefined
    }));
    let anilistId: string | null;
    let mappings: Awaited<ReturnType<typeof buildAniListEpisodeMappings>>;

    try {
      anilistId = await resolveSeasonAniListId({
        title: args.title,
        seasonNumber: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year
      });
      mappings = await buildAniListEpisodeMappings({
        anilistId,
        title: args.title,
        season: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year,
        episodes
      });
    } catch (error) {
      if (isAniListError(error)) return null;
      throw error;
    }

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
      episodes
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
