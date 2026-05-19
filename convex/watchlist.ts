import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toWatchlistGridItem,
  toWatchlistUpdateMeta,
  type WatchlistGridItem,
  type WatchlistUpdateMeta
} from "../shared/contentMetadata";
import { findOrCreateUserIdByClerkId, findUserIdByClerkIdQuery } from "./lib/users";
import { buildContentSnapshot, hasContentSnapshot } from "./lib/contentSnapshots";

function getTvCounts(content: Pick<Doc<"content">, "seasons" | "totalEpisodes">) {
  return {
    seasons: content.seasons ?? 0,
    episodes: content.totalEpisodes ?? 0
  };
}

function getWatchlistUpdateDelta(
  item: Pick<Doc<"watchlist">, "lastAcknowledgedSeasonCount" | "lastAcknowledgedEpisodeCount">,
  content: Pick<Doc<"content">, "seasons" | "totalEpisodes">
) {
  const current = getTvCounts(content);
  const acknowledgedSeasonCount = item.lastAcknowledgedSeasonCount ?? current.seasons;
  const acknowledgedEpisodeCount = item.lastAcknowledgedEpisodeCount ?? current.episodes;

  return {
    currentSeasonCount: current.seasons,
    currentEpisodeCount: current.episodes,
    newSeasons: Math.max(0, current.seasons - acknowledgedSeasonCount),
    newEpisodes: Math.max(0, current.episodes - acknowledgedEpisodeCount)
  };
}

function toSnapshotBackedWatchlistGridItem(
  item: Doc<"watchlist">,
  content?: Doc<"content"> | null
) {
  const tvCounts = content ? getTvCounts(content) : { seasons: 0, episodes: 0 };
  const delta = getWatchlistUpdateDelta(item, tvCounts);
  return toWatchlistGridItem({
    _id: content?._id ?? item.contentId,
    title: content?.title ?? item.title!,
    type: content?.type ?? item.contentType!,
    posterUrl: content?.posterUrl ?? item.posterUrl!,
    tmdbId: content?.tmdbId ?? item.tmdbId,
    watchlistFolder: item.folder,
    watchlistNewSeasons: delta.newSeasons,
    watchlistNewEpisodes: delta.newEpisodes
  });
}

async function getUserIdForQuery(ctx: QueryCtx, clerkUserId: string) {
  return await findUserIdByClerkIdQuery(ctx, clerkUserId);
}

async function getUserIdForMutation(ctx: MutationCtx, clerkUserId: string) {
  return await findOrCreateUserIdByClerkId(ctx, clerkUserId);
}

export const listWatchlist = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistGridItem[]> => {
    const userId = await getUserIdForQuery(ctx, clerkUserId);
    if (!userId) return [];

    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_user_added_at", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const result: WatchlistGridItem[] = [];
    for (const item of items) {
      let content: Doc<"content"> | null = null;
      if (!hasContentSnapshot(item)) {
        content = await ctx.db.get(item.contentId);
        if (!content) continue;
      }

      result.push(toSnapshotBackedWatchlistGridItem(item, content));
    }

    return result;
  }
});

export const listWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<string[]> => {
    const userId = await getUserIdForQuery(ctx, clerkUserId);
    if (!userId) return [];

    const user = await ctx.db.get(userId);
    if (user?.watchlistContentIds) {
      return user.watchlistContentIds;
    }

    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_user_added_at", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    return items.map((item) => item.contentId);
  }
});

export const addWatchlistEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserIdForMutation(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();
    if (existing) return true;

    const content = await ctx.db.get(contentId);
    const counts = content ? getTvCounts(content) : { seasons: 0, episodes: 0 };

    await ctx.db.insert("watchlist", {
      userId,
      contentId,
      addedAt: Date.now(),
      folder: undefined,
      ...(content ? buildContentSnapshot(content) : {}),
      lastAcknowledgedSeasonCount: counts.seasons,
      lastAcknowledgedEpisodeCount: counts.episodes
    });
    const user = await ctx.db.get(userId);
    if (user) {
      const nextIds = Array.from(new Set([...(user.watchlistContentIds ?? []), contentId]));
      await ctx.db.patch(userId, { watchlistContentIds: nextIds });
    }

    return true;
  }
});

export const removeWatchlistEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await getUserIdForMutation(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();
    if (!existing) return false;

    await ctx.db.delete(existing._id);
    const user = await ctx.db.get(userId);
    if (user?.watchlistContentIds) {
      await ctx.db.patch(userId, {
        watchlistContentIds: user.watchlistContentIds.filter((id) => id !== contentId)
      });
    }
    return true;
  }
});

export const setWatchlistFolder = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content"),
    folder: v.optional(v.string())
  },
  handler: async (ctx, { clerkUserId, contentId, folder }): Promise<boolean> => {
    const userId = await getUserIdForMutation(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();
    if (!existing) return false;

    await ctx.db.patch(existing._id, {
      folder: folder?.trim() || undefined
    });

    return true;
  }
});

export const listWatchlistUpdates = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistUpdateMeta[]> => {
    const userId = await getUserIdForQuery(ctx, clerkUserId);
    if (!userId) return [];

    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const updates: WatchlistUpdateMeta[] = [];

    for (const item of items) {
      if (item.contentType === "movie") continue;

      const content = await ctx.db.get(item.contentId);
      if (!content || content.type !== "tv") continue;

      const delta = getWatchlistUpdateDelta(item, content);
      if (delta.newSeasons === 0 && delta.newEpisodes === 0) continue;

      updates.push(
        toWatchlistUpdateMeta({
          contentId: item.contentId,
          title: item.title ?? content.title,
          posterUrl: item.posterUrl ?? content.posterUrl,
          tmdbId: item.tmdbId ?? content.tmdbId,
          currentSeasonCount: delta.currentSeasonCount,
          currentEpisodeCount: delta.currentEpisodeCount,
          newSeasons: delta.newSeasons,
          newEpisodes: delta.newEpisodes,
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
    const userId = await getUserIdForMutation(ctx, clerkUserId);
    if (!userId) return 0;

    const items = contentIds?.length
      ? (
          await Promise.all(
            contentIds.map((contentId) =>
              ctx.db
                .query("watchlist")
                .withIndex("by_user_content", (q) =>
                  q.eq("userId", userId).eq("contentId", contentId)
                )
                .first()
            )
          )
        ).filter((item): item is Doc<"watchlist"> => !!item)
      : await ctx.db
          .query("watchlist")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect();

    let updatedCount = 0;
    for (const item of items) {
      const content = await ctx.db.get(item.contentId);
      if (!content || content.type !== "tv") continue;

      const counts = getTvCounts(content);
      await ctx.db.patch(item._id, {
        lastAcknowledgedSeasonCount: counts.seasons,
        lastAcknowledgedEpisodeCount: counts.episodes
      });
      updatedCount += 1;
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

      await ctx.db.patch(item._id, buildContentSnapshot(content));
      updated += 1;
    }

    return updated;
  }
});
