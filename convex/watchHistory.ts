import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

type WatchHistoryContent = Doc<"content"> & {
  progress: number;
  completed: boolean;
  watchedAt: number;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
};

async function getUserByClerkIdQuery(
  ctx: QueryCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();

  return user?._id ?? null;
}

async function getUserByClerkId(
  ctx: MutationCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();

  if (!user) {
    const userId = await ctx.db.insert("users", {
      clerkUserId,
      email: undefined,
      name: undefined,
      createdAt: Date.now()
    });
    return userId;
  }

  return user._id;
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(progress, 100));
}

export const getMyWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryContent[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const historyItems = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    const result: WatchHistoryContent[] = [];
    for (const item of historyItems) {
      const content = await ctx.db.get(item.contentId);
      if (content) {
        result.push({
          ...content,
          progress: item.progress,
          completed: item.completed,
          watchedAt: item.watchedAt,
          positionSeconds: item.positionSeconds,
          durationSeconds: item.durationSeconds,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber
        });
      }
    }
    return result;
  }
});

export const getContinueWatching = query({
  args: { clerkUserId: v.string() },
  handler: async (
    ctx,
    { clerkUserId }
  ): Promise<
    Array<
      Doc<"content"> & {
        progress: number;
        completed: boolean;
        watchedAt: number;
        positionSeconds?: number;
        durationSeconds?: number;
        seasonNumber?: number;
        episodeNumber?: number;
      }
    >
  > => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const historyItems = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_completed_watched_at", (q) =>
        q.eq("userId", userId).eq("completed", false)
      )
      .order("desc")
      .take(10);

    const result: Array<
      Doc<"content"> & {
        progress: number;
        completed: boolean;
        watchedAt: number;
        positionSeconds?: number;
        durationSeconds?: number;
        seasonNumber?: number;
        episodeNumber?: number;
      }
    > = [];
    for (const item of historyItems) {
      const content = await ctx.db.get(item.contentId);
      if (content) {
        result.push({
          ...content,
          progress: item.progress,
          completed: item.completed,
          watchedAt: item.watchedAt,
          positionSeconds: item.positionSeconds,
          durationSeconds: item.durationSeconds,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber
        });
      }
    }
    return result;
  }
});

export const getWatchProgress = query({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (
    ctx,
    { clerkUserId, contentId }
  ): Promise<{
    progress: number;
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
    seasonNumber: number | null;
    episodeNumber: number | null;
  }> => {
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
      episodeNumber: historyItem?.episodeNumber ?? null
    };
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
    episodeNumber: v.optional(v.number())
  },
  handler: async (
    ctx,
    {
      clerkUserId,
      contentId,
      progress,
      completed,
      positionSeconds,
      durationSeconds,
      seasonNumber,
      episodeNumber
    }
  ): Promise<void> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) throw new Error("User not found");
    const normalizedProgress = normalizeProgress(progress);
    const normalizedPositionSeconds =
      positionSeconds !== undefined && Number.isFinite(positionSeconds)
        ? Math.max(0, positionSeconds)
        : undefined;
    const normalizedDurationSeconds =
      durationSeconds !== undefined && Number.isFinite(durationSeconds)
        ? Math.max(0, durationSeconds)
        : undefined;
    const normalizedSeasonNumber =
      seasonNumber !== undefined && Number.isFinite(seasonNumber)
        ? Math.max(1, Math.floor(seasonNumber))
        : undefined;
    const normalizedEpisodeNumber =
      episodeNumber !== undefined && Number.isFinite(episodeNumber)
        ? Math.max(1, Math.floor(episodeNumber))
        : undefined;

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    const isCompleted = completed ?? normalizedProgress >= 95;

    if (existing) {
      await ctx.db.patch(existing._id, {
        progress: normalizedProgress,
        positionSeconds: normalizedPositionSeconds ?? existing.positionSeconds,
        durationSeconds: normalizedDurationSeconds ?? existing.durationSeconds,
        seasonNumber: normalizedSeasonNumber ?? existing.seasonNumber,
        episodeNumber: normalizedEpisodeNumber ?? existing.episodeNumber,
        completed: isCompleted,
        watchedAt: Date.now()
      });
    } else {
      await ctx.db.insert("watchHistory", {
        userId,
        contentId,
        progress: normalizedProgress,
        positionSeconds: normalizedPositionSeconds,
        durationSeconds: normalizedDurationSeconds,
        seasonNumber: normalizedSeasonNumber,
        episodeNumber: normalizedEpisodeNumber,
        completed: isCompleted,
        watchedAt: Date.now()
      });
    }
  }
});

export const markAsCompleted = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content")
  },
  handler: async (ctx, { clerkUserId, contentId }): Promise<void> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) throw new Error("User not found");

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        progress: 100,
        completed: true,
        watchedAt: Date.now()
      });
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
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content")
  },
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
