import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import {
  toContentMetaSnapshot,
  toWatchHistoryItemMeta,
  type WatchHistoryItemMeta
} from "../shared/contentMetadata";
import { findOrCreateUserIdByClerkId, findUserIdByClerkIdQuery } from "./lib/users";

function hasHistorySnapshot(item: {
  title?: string;
  contentType?: "movie" | "tv";
  genre?: string[];
  year?: number;
  rating?: string;
  posterUrl?: string;
  new?: boolean;
}) {
  return !!(
    item.title &&
    item.contentType &&
    item.genre &&
    item.rating &&
    item.posterUrl &&
    item.year !== undefined &&
    item.new !== undefined
  );
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(progress, 100));
}

export const listWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemMeta[]> => {
    const userId = await findUserIdByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const historyItems = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    const result = [];
    for (const item of historyItems) {
      const content = hasHistorySnapshot(item) ? null : await ctx.db.get(item.contentId);
      if (!content && !hasHistorySnapshot(item)) continue;

      result.push(
        toWatchHistoryItemMeta({
          ...(content
            ? content
            : {
                _id: item.contentId,
                title: item.title!,
                type: item.contentType!,
                genre: item.genre!,
                year: item.year!,
                rating: item.rating!,
                voteAverage: item.voteAverage,
                posterUrl: item.posterUrl!,
                tmdbId: item.tmdbId,
                new: item.new!
              }),
          progress: item.progress,
          completed: item.completed,
          watchedAt: item.watchedAt,
          positionSeconds: item.positionSeconds,
          durationSeconds: item.durationSeconds,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          source: item.source,
          dub: item.dub
        })
      );
    }
    return result;
  }
});

export const listContinueWatching = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemMeta[]> => {
    const userId = await findUserIdByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const historyItems = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_completed_watched_at", (q) =>
        q.eq("userId", userId).eq("completed", false)
      )
      .order("desc")
      .take(10);

    const result = [];
    for (const item of historyItems) {
      const content = hasHistorySnapshot(item) ? null : await ctx.db.get(item.contentId);
      if (!content && !hasHistorySnapshot(item)) continue;

      result.push(
        toWatchHistoryItemMeta({
          ...(content
            ? content
            : {
                _id: item.contentId,
                title: item.title!,
                type: item.contentType!,
                genre: item.genre!,
                year: item.year!,
                rating: item.rating!,
                voteAverage: item.voteAverage,
                posterUrl: item.posterUrl!,
                tmdbId: item.tmdbId,
                new: item.new!
              }),
          progress: item.progress,
          completed: item.completed,
          watchedAt: item.watchedAt,
          positionSeconds: item.positionSeconds,
          durationSeconds: item.durationSeconds,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          source: item.source,
          dub: item.dub
        })
      );
    }
    return result;
  }
});

async function fetchAllWatchProgress(ctx: QueryCtx, clerkUserId: string) {
  const userId = await findUserIdByClerkIdQuery(ctx, clerkUserId);
  if (!userId) return [];

  const historyItems = await ctx.db
    .query("watchHistory")
    .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
    .order("desc")
    .take(100);

  return historyItems.map((item) => ({
    contentId: item.contentId,
    progress: item.progress || 0,
    positionSeconds: item.positionSeconds || 0,
    durationSeconds: item.durationSeconds || 0,
    completed: item.completed || false,
    seasonNumber: item.seasonNumber ?? null,
    episodeNumber: item.episodeNumber ?? null,
    source: item.source ?? null,
    dub: item.dub ?? null,
    watchedAt: item.watchedAt
  }));
}

export const listWatchProgressEntries = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return fetchAllWatchProgress(ctx, clerkUserId);
  }
});

export const saveWatchProgress = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content"),
    progress: v.number(),
    completed: v.optional(v.boolean()),
    positionSeconds: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    source: v.optional(v.string()),
    dub: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<void> => {
    const {
      clerkUserId,
      contentId,
      progress,
      completed,
      positionSeconds,
      durationSeconds,
      seasonNumber,
      episodeNumber,
      source,
      dub
    } = args;
    const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
    if (!userId) throw new Error("User not found");

    const normalizedProgress = normalizeProgress(progress);
    const isCompleted = completed ?? normalizedProgress >= 95;

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) {
      const snapshot = hasHistorySnapshot(existing) ? null : await ctx.db.get(contentId);
      await ctx.db.patch(existing._id, {
        ...(snapshot ? toContentMetaSnapshot(snapshot) : {}),
        progress: normalizedProgress,
        positionSeconds: positionSeconds ?? existing.positionSeconds,
        durationSeconds: durationSeconds ?? existing.durationSeconds,
        seasonNumber: seasonNumber ?? existing.seasonNumber,
        episodeNumber: episodeNumber ?? existing.episodeNumber,
        source: source ?? existing.source,
        dub: dub ?? existing.dub,
        completed: isCompleted,
        watchedAt: Date.now()
      });
    } else {
      const content = await ctx.db.get(contentId);
      await ctx.db.insert("watchHistory", {
        userId,
        contentId,
        ...(content ? toContentMetaSnapshot(content) : {}),
        progress: normalizedProgress,
        positionSeconds,
        durationSeconds,
        seasonNumber,
        episodeNumber,
        source,
        dub,
        completed: isCompleted,
        watchedAt: Date.now()
      });
    }
  }
});

export const removeWatchHistoryEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  }
});

export const compactWatchHistorySnapshots = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 5000 }) => {
    const items = await ctx.db.query("watchHistory").take(limit);
    let updated = 0;

    for (const item of items) {
      const content = await ctx.db.get(item.contentId);
      if (!content) continue;

      await ctx.db.patch(item._id, {
        contentType: content.type,
        title: content.title,
        genre: content.genre.slice(0, 2),
        year: content.year,
        rating: content.rating,
        voteAverage: content.voteAverage,
        posterUrl: content.posterUrl,
        tmdbId: content.tmdbId,
        new: content.new
      });
      updated += 1;
    }

    return updated;
  }
});
