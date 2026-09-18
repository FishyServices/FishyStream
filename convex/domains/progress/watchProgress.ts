import { v } from "convex/values";
import { viewerMutation } from "../../lib/auth";
import type { Id } from "../../_generated/dataModel";
import { toImageWire } from "@content/contentMetadata";

const MIN_PROGRESS_DELTA_TO_WRITE = 5;
const MIN_POSITION_DELTA_TO_WRITE_SECONDS = 300;

export const saveWatchProgress = viewerMutation({
  args: {
    contentId: v.string(),
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
    const positionSeconds =
      completed && args.durationSeconds ? args.durationSeconds : args.positionSeconds;

    const existing = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", ctx.viewerId).eq("contentId", args.contentId)
      )
      .first();

    if (existing) {
      const existingWatchedAt = existing.watchedAt ?? 0;
      if (watchedAt < existingWatchedAt) {
        return existing._id;
      }

      const positionDelta = Math.abs((existing.positionSeconds ?? 0) - (args.positionSeconds ?? 0));
      const existingProgress =
        existing.durationSeconds && existing.positionSeconds
          ? (existing.positionSeconds / existing.durationSeconds) * 100
          : 0;
      const existingCompleted = existingProgress >= 95;

      const progressDelta = Math.abs(existingProgress - progress);

      const shouldSkip =
        existingCompleted === completed &&
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
        positionSeconds,
        durationSeconds: args.durationSeconds,
        seasonNumber: args.seasonNumber,
        episodeNumber: args.episodeNumber,
        source: args.source,
        dub: args.dub,
        watchedAt: watchedAt,
        title: args.title,
        posterUrl: toImageWire(args.posterUrl)
      });
      return existing._id;
    }

    return await ctx.db.insert("mediaState", {
      clerkUserId: ctx.viewerId,
      contentId: args.contentId,
      title: args.title,
      posterUrl: toImageWire(args.posterUrl),
      positionSeconds,
      durationSeconds: args.durationSeconds,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      source: args.source,
      dub: args.dub,
      watchedAt: watchedAt
    });
  }
});
