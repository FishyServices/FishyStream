import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { toImageWire, toWatchlistGridWire, type WatchlistGridWire } from "../shared/contentMetadata";

const watchlistSnapshotValidator = v.object({
  title: v.string(),
  type: v.union(v.literal("movie"), v.literal("tv")),
  genre: v.array(v.string()),
  posterUrl: v.string(),
  tmdbId: v.optional(v.string())
});

function compactGenres(genres: string[]) {
  return [];
}

export const listWatchlist = query({
  args: {
    clerkUserId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { clerkUserId, limit = 24 }): Promise<WatchlistGridWire[]> => {
    const pageSize = Math.max(1, Math.min(48, Math.floor(limit)));
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(pageSize);

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
  args: { clerkUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { clerkUserId, limit = 500 }): Promise<string[]> => {
    const maxIds = Math.max(1, Math.min(500, Math.floor(limit)));
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(maxIds);

    return items.map((item) => item.contentId);
  }
});

export const addWatchlistEntry = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content"),
    snapshot: v.optional(watchlistSnapshotValidator)
  },
  handler: async (ctx, { clerkUserId, contentId, snapshot }): Promise<boolean> => {
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
      .first();
    if (existing) return true;

    const content = snapshot ?? (await ctx.db.get(contentId));
    if (!content) return false;

    await ctx.db.insert("watchlist", {
      clerkUserId,
      contentId,
      addedAt: Date.now(),
      folder: undefined,
      contentType: content.type,
      title: content.title,
      genre: compactGenres(content.genre),
      posterUrl: toImageWire(content.posterUrl),
      tmdbId: content.tmdbId
    });

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

    const nextFolder = folder?.trim() || undefined;
    if (existing.folder === nextFolder) return true;

    await ctx.db.patch(existing._id, { folder: nextFolder });

    return true;
  }
});

export const compactWatchlistRows = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<number> => {
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .collect();

    let patched = 0;
    for (const item of items) {
      const nextGenre = compactGenres(item.genre);
      const nextPosterUrl = toImageWire(item.posterUrl);
      const shouldPatch =
        item.genre.length > nextGenre.length ||
        item.posterUrl !== nextPosterUrl ||
        item.year !== undefined ||
        item.voteAverage !== undefined ||
        item.new !== undefined ||
        item.snapshotUpdatedAt !== undefined;

      if (!shouldPatch) continue;

      await ctx.db.patch(item._id, {
        genre: nextGenre,
        posterUrl: nextPosterUrl,
        year: undefined,
        voteAverage: undefined,
        new: undefined,
        snapshotUpdatedAt: undefined
      });
      patched += 1;
    }

    return patched;
  }
});
