"use node";
import { v } from "convex/values";
import { action } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { buildAniListEpisodeMappings } from "@fishy/providers/anime/episodes";
import { resolveAniListId as resolveSeasonAniListId } from "@fishy/providers/anime/anilist";
import { createTMDBClient } from "@fishy/providers/metadata/tmdb";

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

type SeasonPlaybackMetaSyncResult =
  SeasonPlaybackMetaResult | { status: "anilist-unavailable" } | null;

function isAniListError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message.startsWith("AniList API") || ("service" in error && error.service === "AniList"))
  );
}

export const syncAnimeSeasonPlaybackMeta = action({
  args: {
    contentId: v.string(),
    tmdbId: v.string(),
    title: v.string(),
    seasonNumber: v.number(),
    episodeNumber: v.optional(v.number())
  },
  handler: async (ctx, args): Promise<SeasonPlaybackMetaSyncResult> => {
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

    const payload = await createTMDBClient().canonicalSeason(args.tmdbId, args.seasonNumber);
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
        season: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year
      });
      if (!anilistId && payload.seasonNumber > 1) {
        anilistId = await resolveSeasonAniListId({
          title: args.title,
          season: 1,
          year: payload.year ? payload.year - 1 : undefined
        });
      }
      mappings = await buildAniListEpisodeMappings({
        anilistId,
        title: args.title,
        season: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year,
        episodeOffset: payload.episodeOffset,
        episodes
      });
    } catch (error) {
      if (isAniListError(error)) {
        return { status: "anilist-unavailable" };
      }
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
      episodeOffset: payload.episodeOffset,
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

export const clearAniListSeasonMappings = action({
  args: { contentId: v.string() },
  handler: async (ctx, args): Promise<number> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Sign in to clear AniList season mappings.");
    await ctx.runMutation(internal.domains.seasons.seasons.claimAniListMappingClear, {
      identity: identity.tokenIdentifier
    });
    let deleted = 0;
    const stages = ["mappings", "metadata", "seasons"] as const;
    for (const stage of stages) {
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const result: { count: number; cursor: string; done: boolean } = await ctx.runMutation(
          internal.domains.seasons.seasons.clearAniListMappingsBatch,
          { contentId: args.contentId, stage, cursor }
        );
        deleted += result.count;
        cursor = result.cursor;
        done = result.done;
      }
    }
    return deleted;
  }
});
