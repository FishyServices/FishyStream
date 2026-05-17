import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { SeasonMetaSummary } from "../shared/contentMetadata";

export const upsertSeason = internalMutation({
  args: {
    contentId: v.id("content"),
    tmdbId: v.string(),
    anilistId: v.optional(v.string()),
    seasonNumber: v.number(),
    name: v.string(),
    overview: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    airDate: v.optional(v.string()),
    episodeCount: v.number(),
    episodes: v.array(
      v.object({
        episodeNumber: v.number(),
        name: v.string(),
        overview: v.optional(v.string()),
        stillUrl: v.optional(v.string()),
        airDate: v.optional(v.string()),
        runtime: v.optional(v.number()),
        voteAverage: v.number()
      })
    )
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();

    const now = Date.now();
    const existingEpisodeCount = existing?.episodeCount ?? existing?.episodes.length ?? 0;
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("seasons", { ...args, createdAt: now, updatedAt: now });
    }

    const content = await ctx.db.get(args.contentId);
    if (content) {
      const nextSeasonCount = Math.max(content.seasons ?? 0, args.seasonNumber);
      const nextEpisodeTotal = Math.max(
        0,
        (content.totalEpisodes ?? 0) - existingEpisodeCount + args.episodeCount
      );

      await ctx.db.patch(args.contentId, {
        seasons: nextSeasonCount,
        totalEpisodes: nextEpisodeTotal,
        updatedAt: now
      });
    }
  }
});

export const getSeasonsMetaByContent = query({
  args: { contentId: v.id("content") },
  handler: async (ctx, { contentId }): Promise<SeasonMetaSummary[]> => {
    const seasons = await ctx.db
      .query("seasons")
      .withIndex("by_content", (q) => q.eq("contentId", contentId))
      .collect();

    return seasons.map((season) => ({
      _id: season._id,
      contentId: season.contentId,
      seasonNumber: season.seasonNumber,
      name: season.name,
      airDate: season.airDate,
      episodeCount: season.episodeCount,
      anilistId: season.anilistId,
      storedEpisodeCount: season.episodes.length
    }));
  }
});

export const getSeasonsByContent = query({
  args: { contentId: v.id("content") },
  handler: async (ctx, { contentId }): Promise<Doc<"seasons">[]> => {
    return await ctx.db
      .query("seasons")
      .withIndex("by_content", (q) => q.eq("contentId", contentId))
      .collect();
  }
});

export const getSeason = query({
  args: { contentId: v.id("content"), seasonNumber: v.number() },
  handler: async (ctx, { contentId, seasonNumber }): Promise<Doc<"seasons"> | null> => {
    return await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();
  }
});
