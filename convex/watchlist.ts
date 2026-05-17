import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import {
  toWatchlistItemMeta,
  toWatchlistUpdateMeta,
  type WatchlistItemMeta,
  type WatchlistUpdateMeta
} from "../shared/contentMetadata";

function getCurrentTvCounts(content: Doc<"content">): { seasons: number; episodes: number } {
  return {
    seasons: content.seasons ?? 0,
    episodes: content.totalEpisodes ?? 0
  };
}

function getWatchlistDelta(item: Doc<"watchlist">, content: Doc<"content">) {
  const currentCounts = getCurrentTvCounts(content);
  const currentSeasonCount = currentCounts.seasons;
  const currentEpisodeCount = currentCounts.episodes;
  const acknowledgedSeasonCount = item.lastAcknowledgedSeasonCount ?? currentSeasonCount;
  const acknowledgedEpisodeCount = item.lastAcknowledgedEpisodeCount ?? currentEpisodeCount;

  return {
    currentSeasonCount,
    currentEpisodeCount,
    acknowledgedSeasonCount,
    acknowledgedEpisodeCount,
    newSeasons: Math.max(0, currentSeasonCount - acknowledgedSeasonCount),
    newEpisodes: Math.max(0, currentEpisodeCount - acknowledgedEpisodeCount)
  };
}

async function getUserByClerkIdQuery(
  ctx: QueryCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  let user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  const allUsers = await ctx.db.query("users").take(500);
  const legacyUser = allUsers.find(
    (u) => u.clerkUserId.endsWith(`|${clerkUserId}`) || u.clerkUserId === clerkUserId
  );

  return legacyUser?._id ?? null;
}

async function getUserByClerkId(
  ctx: MutationCtx,
  clerkUserId: string
): Promise<Id<"users"> | null> {
  let user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();

  if (user) return user._id;

  const allUsers = await ctx.db.query("users").take(500);
  const legacyUser = allUsers.find(
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

export const getMyWatchlist = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistItemMeta[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const contentItems: WatchlistItemMeta[] = [];
    for (const item of watchlistItems) {
      const content = await ctx.db.get(item.contentId);
      if (!content) continue;

      const {
        currentSeasonCount,
        currentEpisodeCount,
        acknowledgedSeasonCount,
        acknowledgedEpisodeCount
      } = getWatchlistDelta(item, content);

      contentItems.push(
        toWatchlistItemMeta({
          ...content,
          watchlistAddedAt: item.addedAt,
          watchlistFolder: item.folder,
          watchlistNewSeasons: Math.max(0, currentSeasonCount - acknowledgedSeasonCount),
          watchlistNewEpisodes: Math.max(0, currentEpisodeCount - acknowledgedEpisodeCount)
        })
      );
    }

    return contentItems.sort((a, b) => b.watchlistAddedAt - a.watchlistAddedAt);
  }
});

export const isInWatchlist = query({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    return !!existing;
  }
});

export const getAllWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<string[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return watchlistItems.map((item) => item.contentId);
  }
});

export const areInWatchlist = query({
  args: { clerkUserId: v.string(), contentIds: v.array(v.id("content")) },
  handler: async (ctx, { clerkUserId, contentIds }): Promise<string[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const inWatchlist: string[] = [];
    for (const contentId of contentIds) {
      const existing = await ctx.db
        .query("watchlist")
        .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
        .first();
      if (existing) inWatchlist.push(contentId);
    }
    return inWatchlist;
  }
});

export const add = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) return true;

    const content = await ctx.db.get(contentId);
    const currentCounts = content ? getCurrentTvCounts(content) : { seasons: 0, episodes: 0 };
    await ctx.db.insert("watchlist", {
      userId,
      contentId,
      addedAt: Date.now(),
      folder: undefined,
      lastAcknowledgedSeasonCount: currentCounts.seasons,
      lastAcknowledgedEpisodeCount: currentCounts.episodes
    });
    return true;
  }
});

export const remove = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
      return true;
    }
    return false;
  }
});

export const updateFolder = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content"),
    folder: v.optional(v.string())
  },
  handler: async (ctx, { clerkUserId, contentId, folder }): Promise<boolean> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();

    if (!existing) return false;

    const normalizedFolder = folder?.trim() || undefined;
    await ctx.db.patch(existing._id, {
      folder: normalizedFolder
    });
    return true;
  }
});

export const getUpdates = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistUpdateMeta[]> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const updates: WatchlistUpdateMeta[] = [];

    for (const item of watchlistItems) {
      const content = await ctx.db.get(item.contentId);
      if (!content || content.type !== "tv") continue;

      const { currentSeasonCount, currentEpisodeCount, newSeasons, newEpisodes } =
        getWatchlistDelta(item, content);

      if (newSeasons === 0 && newEpisodes === 0) continue;

      updates.push(
        toWatchlistUpdateMeta({
          contentId: content._id,
          title: content.title,
          posterUrl: content.posterUrl,
          tmdbId: content.tmdbId,
          currentSeasonCount,
          currentEpisodeCount,
          newSeasons,
          newEpisodes,
          folder: item.folder
        })
      );
    }

    return updates.sort((a, b) => {
      const aWeight = a.newSeasons * 1000 + a.newEpisodes;
      const bWeight = b.newSeasons * 1000 + b.newEpisodes;
      return bWeight - aWeight;
    });
  }
});

export const getUpdateCount = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<number> => {
    const userId = await getUserByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return 0;

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let count = 0;

    for (const item of watchlistItems) {
      const content = await ctx.db.get(item.contentId);
      if (!content || content.type !== "tv") continue;

      const { newSeasons, newEpisodes } = getWatchlistDelta(item, content);

      if (newSeasons > 0 || newEpisodes > 0) {
        count++;
      }
    }

    return count;
  }
});

export const acknowledgeUpdates = mutation({
  args: {
    clerkUserId: v.string(),
    contentIds: v.optional(v.array(v.id("content")))
  },
  handler: async (ctx, { clerkUserId, contentIds }): Promise<number> => {
    const userId = await getUserByClerkId(ctx, clerkUserId);
    if (!userId) return 0;

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const contentFilter = contentIds ? new Set(contentIds) : null;
    let updatedCount = 0;

    for (const item of watchlistItems) {
      if (contentFilter && !contentFilter.has(item.contentId)) continue;

      const content = await ctx.db.get(item.contentId);
      if (!content || content.type !== "tv") continue;
      const currentCounts = getCurrentTvCounts(content);

      await ctx.db.patch(item._id, {
        lastAcknowledgedSeasonCount: currentCounts.seasons,
        lastAcknowledgedEpisodeCount: currentCounts.episodes
      });
      updatedCount++;
    }

    return updatedCount;
  }
});
