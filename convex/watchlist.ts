import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toWatchlistGridItem,
  toWatchlistGridWire,
  type WatchlistGridItem,
  type WatchlistGridWire
} from "../shared/contentMetadata";
import { findOrCreateUserIdByClerkId, findUserIdByClerkIdQuery } from "./lib/users";
import { buildContentSnapshot, hasContentSnapshot } from "./lib/contentSnapshots";

function toSnapshotBackedWatchlistGridItem(
  item: Doc<"watchlist">,
  content?: Doc<"content"> | null
) {
  return toWatchlistGridItem({
    _id: content?._id ?? item.contentId,
    title: content?.title ?? item.title!,
    type: content?.type ?? item.contentType!,
    posterUrl: content?.posterUrl ?? item.posterUrl!,
    tmdbId: content?.tmdbId ?? item.tmdbId,
    watchlistFolder: item.folder,
    genre: content?.genre ?? item.genre
  });
}

async function getUserIdForQuery(ctx: QueryCtx, clerkUserId: string) {
  return await findUserIdByClerkIdQuery(ctx, clerkUserId);
}

async function getUserIdForMutation(ctx: MutationCtx, clerkUserId: string) {
  return await findOrCreateUserIdByClerkId(ctx, clerkUserId);
}

async function refreshWatchlistRecommendationSeed(ctx: MutationCtx, userId: Id<"users">) {
  const items = await ctx.db
    .query("watchlist")
    .withIndex("by_user_added_at", (q) => q.eq("userId", userId))
    .order("desc")
    .take(24);

  const typeCounts = new Map<"movie" | "tv", number>();
  const genreCounts = new Map<string, number>();

  for (const item of items) {
    if (item.contentType) {
      typeCounts.set(item.contentType, (typeCounts.get(item.contentType) ?? 0) + 1);
    }
    for (const genre of item.genre ?? []) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  await ctx.db.patch(userId, {
    watchlistRecommendationType:
      Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? undefined,
    watchlistRecommendationGenres: Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => genre)
  });
}

export const listWatchlist = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistGridWire[]> => {
    const userId = await getUserIdForQuery(ctx, clerkUserId);
    if (!userId) return [];

    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_user_added_at", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const result: WatchlistGridWire[] = [];
    for (const item of items) {
      let content: Doc<"content"> | null = null;
      if (!hasContentSnapshot(item)) {
        content = await ctx.db.get(item.contentId);
        if (!content) continue;
      }

      result.push(toWatchlistGridWire(toSnapshotBackedWatchlistGridItem(item, content)));
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

    await ctx.db.insert("watchlist", {
      userId,
      contentId,
      addedAt: Date.now(),
      folder: undefined,
      ...(content ? buildContentSnapshot(content) : {})
    });
    const user = await ctx.db.get(userId);
    if (user) {
      const nextIds = Array.from(new Set([...(user.watchlistContentIds ?? []), contentId]));
      await ctx.db.patch(userId, { watchlistContentIds: nextIds });
    }
    await refreshWatchlistRecommendationSeed(ctx, userId);

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
    await refreshWatchlistRecommendationSeed(ctx, userId);
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
