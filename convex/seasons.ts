import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";

export const upsertSeason = internalMutation({
  args: {
    contentId: v.id("content"),
    tmdbId: v.string(),
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
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("seasons", { ...args, createdAt: now, updatedAt: now });
    }
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
