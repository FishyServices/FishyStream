import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  fromImageWire,
  toImageWire,
  toWatchlistGridWire,
  type WatchlistGridWire
} from "../shared/contentMetadata";

const mediaType = v.union(v.literal("movie"), v.literal("tv"));

const watchlistSnapshotValidator = v.object({
  title: v.string(),
  type: mediaType,
  posterUrl: v.string(),
  tmdbId: v.string(),
  genre: v.optional(v.array(v.string())),
  year: v.optional(v.number()),
  voteAverage: v.optional(v.number())
});

export const listWatchlist = query({
  args: {
    clerkUserId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { clerkUserId, limit = 150 }): Promise<WatchlistGridWire[]> => {
    const pageSize = Math.max(1, Math.min(150, Math.floor(limit)));
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(pageSize);

    return items.map((item) =>
      toWatchlistGridWire({
        _id: item.contentId as never,
        title: item.title,
        type: item.contentType,
        posterUrl: fromImageWire(item.posterUrl),
        tmdbId: item.tmdbId,
        watchlistFolder: item.folder
      })
    );
  }
});

export const listWatchlistContentIds = query({
  args: { clerkUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { clerkUserId, limit = 300 }
  ): Promise<Array<{ id: string; tmdbId?: string }>> => {
    const maxIds = Math.max(1, Math.min(300, Math.floor(limit)));
    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(maxIds);

    return items.map((item) => ({ id: item.contentId, tmdbId: item.tmdbId }));
  }
});

export const addWatchlistEntry = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.string(),
    snapshot: watchlistSnapshotValidator
  },
  handler: async (ctx, { clerkUserId, contentId, snapshot }): Promise<boolean> => {
    const existing = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
      .first();
    if (existing) return true;

    await ctx.db.insert("watchlist", {
      clerkUserId,
      contentId,
      addedAt: Date.now(),
      folder: undefined,
      contentType: snapshot.type,
      title: snapshot.title,
      posterUrl: toImageWire(snapshot.posterUrl),
      tmdbId: snapshot.tmdbId,
      genre: snapshot.genre,
      year: snapshot.year,
      voteAverage: snapshot.voteAverage
    });

    return true;
  }
});

export const removeWatchlistEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.string() },
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
    contentId: v.string(),
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
