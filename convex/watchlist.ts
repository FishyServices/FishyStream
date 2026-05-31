import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { toWatchlistGridWire, type WatchlistGridWire } from "../shared/contentMetadata";
import { findOrCreateUserIdByClerkId } from "./lib/users";
import { buildContentSnapshot } from "./lib/contentSnapshots";

async function refreshWatchlistRecommendationSeed(ctx: MutationCtx, clerkUserId: string) {
  const userId = await findOrCreateUserIdByClerkId(ctx, clerkUserId);
  if (!userId) return;

  const items = await ctx.db
    .query("watchlist")
    .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
    .order("desc")
    .take(24);

  const typeCounts = new Map<"movie" | "tv", number>();
  const genreCounts = new Map<string, number>();

  for (const item of items) {
    typeCounts.set(item.contentType, (typeCounts.get(item.contentType) ?? 0) + 1);
    for (const genre of item.genre) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  await ctx.db.patch(userId, {
    watchlistContentIds: items.map((item) => item.contentId),
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
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .collect();

    return items.map((item) =>
      toWatchlistGridWire({
        _id: item.contentId,
        title: item.title,
        type: item.contentType,
        posterUrl: item.posterUrl,
        tmdbId: item.tmdbId,
        watchlistFolder: item.folder,
        genre: item.genre
      })
    );
  }
});

export const listWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<string[]> => {
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .collect();

    return items.map((item) => item.contentId);
  }
});

export const addWatchlistEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
      .first();
    if (existing) return true;

    const content = await ctx.db.get(contentId);
    if (!content) return false;

    await ctx.db.insert("watchlist", {
      clerkUserId,
      contentId,
      addedAt: Date.now(),
      folder: undefined,
      ...buildContentSnapshot(content)
    });
    await refreshWatchlistRecommendationSeed(ctx, clerkUserId);

    return true;
  }
});

export const removeWatchlistEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
      .first();
    if (!existing) return false;

    await ctx.db.delete(existing._id);
    await refreshWatchlistRecommendationSeed(ctx, clerkUserId);
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
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
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
  handler: async () => {
    return 0;
  }
});
