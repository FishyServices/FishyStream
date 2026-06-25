import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  fromImageWire,
  toImageWire,
  type WatchlistGridItem,
  parseContentId
} from "../shared/contentMetadata";

export const listWatchlist = query({
  args: {
    clerkUserId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { clerkUserId, limit = 150 }): Promise<WatchlistGridItem[]> => {
    const pageSize = Math.max(1, Math.min(150, Math.floor(limit)));
    const items = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watchlist_added", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(pageSize);

    return items
      .filter((item) => item.watchlistAddedAt)
      .map((item) => {
        const parsed = parseContentId(item.contentId);
        return {
          _id: item.contentId as never,
          title: item.title,
          type: parsed?.type || "movie",
          posterUrl: fromImageWire(item.posterUrl),
          tmdbId: parsed?.tmdbId || "",
          watchlistFolder: item.folder
        };
      });
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
      .query("mediaState")
      .withIndex("by_clerk_watchlist_added", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(maxIds);

    return items
      .filter((item) => item.watchlistAddedAt)
      .map((item) => {
        const parsed = parseContentId(item.contentId);
        return { id: item.contentId, tmdbId: parsed?.tmdbId || "" };
      });
  }
});

export const toggleWatchlistEntry = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.string(),
    tmdbId: v.string(),
    contentType: v.union(v.literal("movie"), v.literal("tv")),
    title: v.string(),
    posterUrl: v.string(),
    inWatchlist: v.boolean()
  },
  handler: async (ctx, args): Promise<boolean> => {
    const existing = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("contentId", args.contentId)
      )
      .first();

    if (existing) {
      const currentlyInWatchlist = !!existing.watchlistAddedAt;
      if (currentlyInWatchlist === args.inWatchlist) return true;
      await ctx.db.patch(existing._id, {
        watchlistAddedAt: args.inWatchlist ? Date.now() : undefined,
        title: args.title,
        posterUrl: toImageWire(args.posterUrl)
      });
    } else if (args.inWatchlist) {
      await ctx.db.insert("mediaState", {
        clerkUserId: args.clerkUserId,
        contentId: args.contentId,
        title: args.title,
        posterUrl: toImageWire(args.posterUrl),
        watchlistAddedAt: Date.now()
      });
    }

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
      .query("mediaState")
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
