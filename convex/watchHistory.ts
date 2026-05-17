import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { toWatchHistoryItemMeta, type WatchHistoryItemMeta } from "../shared/contentMetadata";

async function getUserByClerkIdQuery(
  ctx: QueryCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  const legacyUsers = await ctx.db.query("users").take(500);
  const legacyUser = legacyUsers.find(
    (u) => u.clerkUserId.endsWith(`|${clerkUserId}`) || u.clerkUserId === clerkUserId
  );
  return legacyUser?._id ?? null;
}

async function getUserByClerkId(
  ctx: MutationCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  const legacyUsers = await ctx.db.query("users").take(500);
  const legacyUser = legacyUsers.find(
    (u) => u.clerkUserId.endsWith(`|${clerkUserId}`) || u.clerkUserId === clerkUserId
  );

  if (legacyUser) {
    await ctx.db.patch(legacyUser._id, { clerkUserId });
    return legacyUser._id;
  }

  const userId = await ctx.db.insert("users", {
    clerkUserId,
    email: undefined,
    name: undefined,
    createdAt: Date.now()
  });
  return userId;
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(progress, 100));
}

export const getMyWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemMeta[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const historyItems = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    const result = [];
    for (const item of historyItems) {
      const content = await ctx.db.get(item.contentId);
      if (content) {
        result.push(toWatchHistoryItemMeta({
          ...content,
          progress: item.progress,
          completed: item.completed,
          watchedAt: item.watchedAt,
          positionSeconds: item.positionSeconds,
          durationSeconds: item.durationSeconds,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          source: item.source,
          dub: item.dub
        }));
      }
    }
    return result;
  }
});

export const getContinueWatching = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemMeta[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
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
      const content = await ctx.db.get(item.contentId);
      if (content) {
        result.push(toWatchHistoryItemMeta({
          ...content,
          progress: item.progress,
          completed: item.completed,
          watchedAt: item.watchedAt,
          positionSeconds: item.positionSeconds,
          durationSeconds: item.durationSeconds,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          source: item.source,
          dub: item.dub
        }));
      }
    }
    return result;
  }
});

export const getWatchProgress = query({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }) => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) {
      return {
        progress: 0,
        positionSeconds: 0,
        durationSeconds: 0,
        completed: false,
        seasonNumber: null,
        episodeNumber: null
      };
    }

    const historyItem = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    return {
      progress: historyItem?.progress || 0,
      positionSeconds: historyItem?.positionSeconds || 0,
      durationSeconds: historyItem?.durationSeconds || 0,
      completed: historyItem?.completed || false,
      seasonNumber: historyItem?.seasonNumber ?? null,
      episodeNumber: historyItem?.episodeNumber ?? null,
      source: historyItem?.source ?? null,
      dub: historyItem?.dub ?? null
    };
  }
});

async function fetchAllWatchProgress(ctx: QueryCtx, clerkUserId: string) {
  const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
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

export const getAllWatchProgress = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return fetchAllWatchProgress(ctx, clerkUserId);
  }
});

export const getAllWatchProgressAction = action({
  args: { clerkUserId: v.string() },
  handler: async (
    ctx,
    { clerkUserId }
  ): Promise<
    Array<{
      contentId: string;
      progress: number;
      positionSeconds: number;
      durationSeconds: number;
      completed: boolean;
      seasonNumber: number | null;
      episodeNumber: number | null;
      source: string | null;
      dub: boolean | null;
      watchedAt: number;
    }>
  > => {
    return ctx.runQuery(api.watchHistory.getAllWatchProgress, { clerkUserId });
  }
});

export const updateProgress = mutation({
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
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) throw new Error("User not found");

    const normalizedProgress = normalizeProgress(progress);
    const isCompleted = completed ?? normalizedProgress >= 95;

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
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
      await ctx.db.insert("watchHistory", {
        userId,
        contentId,
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

export const markAsCompleted = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<void> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) throw new Error("User not found");

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { progress: 100, completed: true, watchedAt: Date.now() });
    } else {
      await ctx.db.insert("watchHistory", {
        userId,
        contentId,
        progress: 100,
        completed: true,
        watchedAt: Date.now()
      });
    }
  }
});

export const removeFromHistory = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
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
