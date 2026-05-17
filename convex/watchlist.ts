import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  toContentMetaSnapshot,
  toWatchlistItemMeta,
  toWatchlistUpdateMeta,
  type WatchlistItemMeta,
  type WatchlistUpdateMeta
} from "../shared/contentMetadata";
import { findOrCreateUserIdByClerkId, findUserIdByClerkIdQuery } from "./lib/users";

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

function hasWatchlistSnapshot(item: Doc<"watchlist">) {
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

export const listWatchlist = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistItemMeta[]> => {
    const userId = await findUserIdByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const contentItems: WatchlistItemMeta[] = [];
    for (const item of watchlistItems) {
      const content = hasWatchlistSnapshot(item) ? null : await ctx.db.get(item.contentId);
      if (!content && !hasWatchlistSnapshot(item)) continue;

      const {
        currentSeasonCount,
        currentEpisodeCount,
        acknowledgedSeasonCount,
        acknowledgedEpisodeCount
      } = getWatchlistDelta(item, content ?? ({ seasons: 0, totalEpisodes: 0 } as Doc<"content">));

      contentItems.push(
        toWatchlistItemMeta({
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

export const listWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<string[]> => {
    const userId = await findUserIdByClerkIdQuery(ctx, clerkUserId);
    if (!userId) return [];

    const watchlistItems = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return watchlistItems.map((item) => item.contentId);
  }
});

export const addWatchlistEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
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
      ...(content ? toContentMetaSnapshot(content) : {}),
      lastAcknowledgedSeasonCount: currentCounts.seasons,
      lastAcknowledgedEpisodeCount: currentCounts.episodes
    });
    return true;
  }
});

export const removeWatchlistEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
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

export const setWatchlistFolder = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content"),
    folder: v.optional(v.string())
  },
  handler: async (ctx, { clerkUserId, contentId, folder }): Promise<boolean> => {
    const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
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

export const listWatchlistUpdates = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistUpdateMeta[]> => {
    const userId = await findUserIdByClerkIdQuery(ctx, clerkUserId);
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

export const acknowledgeWatchlistUpdates = mutation({
  args: {
    clerkUserId: v.string(),
    contentIds: v.optional(v.array(v.id("content")))
  },
  handler: async (ctx, { clerkUserId, contentIds }): Promise<number> => {
    const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
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

export const compactWatchlistSnapshots = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 5000 }) => {
    const items = await ctx.db.query("watchlist").take(limit);
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
