import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const MIN_PROGRESS_DELTA_TO_WRITE = 5;
const MIN_POSITION_DELTA_TO_WRITE_SECONDS = 300;

export const saveWatchProgress = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.string(),
    tmdbId: v.string(),
    contentType: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterUrl: v.string(),
    progress: v.number(),
    completed: v.boolean(),
    positionSeconds: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    source: v.optional(v.string()),
    dub: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<Id<"mediaState"> | null> => {
    const watchedAt = Date.now();
    const progress = Math.max(0, Math.min(100, args.progress));
    const completed = args.completed || progress >= 95;

    const existing = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("contentId", args.contentId)
      )
      .first();

    if (existing) {
      const existingWatchedAt = existing.watchedAt ?? 0;
      if (watchedAt < existingWatchedAt) {
        return existing._id;
      }

      const positionDelta = Math.abs((existing.positionSeconds ?? 0) - (args.positionSeconds ?? 0));
      const progressDelta = Math.abs((existing.progress ?? 0) - progress);

      const shouldSkip =
        existing.completed === completed &&
        positionDelta < MIN_POSITION_DELTA_TO_WRITE_SECONDS &&
        progressDelta < MIN_PROGRESS_DELTA_TO_WRITE &&
        existing.durationSeconds === args.durationSeconds &&
        existing.seasonNumber === args.seasonNumber &&
        existing.episodeNumber === args.episodeNumber &&
        existing.source === args.source &&
        existing.dub === args.dub;

      if (shouldSkip) {
        return existing._id;
      }

      await ctx.db.patch(existing._id, {
        progress,
        completed,
        positionSeconds: args.positionSeconds,
        durationSeconds: args.durationSeconds,
        seasonNumber: args.seasonNumber,
        episodeNumber: args.episodeNumber,
        source: args.source,
        dub: args.dub,
        watchedAt: watchedAt,
        title: args.title,
        posterUrl: args.posterUrl
      });
      return existing._id;
    }

    return await ctx.db.insert("mediaState", {
      clerkUserId: args.clerkUserId,
      contentId: args.contentId,
      title: args.title,
      posterUrl: args.posterUrl,
      progress,
      completed,
      positionSeconds: args.positionSeconds,
      durationSeconds: args.durationSeconds,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      source: args.source,
      dub: args.dub,
      watchedAt: watchedAt
    });
  }
});
