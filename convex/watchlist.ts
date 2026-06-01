import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { toWatchlistGridWire, type WatchlistGridWire } from "../shared/contentMetadata";

const watchlistSnapshotValidator = v.object({
  title: v.string(),
  type: v.union(v.literal("movie"), v.literal("tv")),
  genre: v.array(v.string()),
  posterUrl: v.string(),
  tmdbId: v.optional(v.string())
});

type WatchlistSummaryItem = WatchlistGridWire;

function toSummaryItem(item: Doc<"watchlist">): WatchlistSummaryItem {
  return toWatchlistGridWire({
    _id: item.contentId,
    title: item.title,
    type: item.contentType,
    posterUrl: item.posterUrl,
    tmdbId: item.tmdbId,
    watchlistFolder: item.folder,
    genre: item.genre
  });
}

function toSnapshotSummaryItem(args: {
  contentId: Id<"content">;
  title: string;
  type: "movie" | "tv";
  genre: string[];
  posterUrl: string;
  tmdbId?: string;
  folder?: string;
}): WatchlistSummaryItem {
  return toWatchlistGridWire({
    _id: args.contentId,
    title: args.title,
    type: args.type,
    posterUrl: args.posterUrl,
    tmdbId: args.tmdbId,
    watchlistFolder: args.folder,
    genre: args.genre
  });
}

async function readSummary(ctx: QueryCtx | MutationCtx, clerkUserId: string) {
  return await ctx.db
    .query("watchlistSummaries")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
}

async function writeSummary(
  ctx: MutationCtx,
  clerkUserId: string,
  items: WatchlistSummaryItem[]
) {
  const existing = await readSummary(ctx, clerkUserId);
  const payload = {
    items,
    contentIds: items.map((item) => item[0]),
    updatedAt: Date.now()
  };

  if (existing) {
    await ctx.db.patch(existing._id, payload);
    return;
  }

  await ctx.db.insert("watchlistSummaries", { clerkUserId, ...payload });
}

async function rebuildSummary(ctx: MutationCtx, clerkUserId: string) {
  const items = await ctx.db
    .query("watchlist")
    .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
    .order("desc")
    .collect();

  await writeSummary(ctx, clerkUserId, items.map(toSummaryItem));
}

export const ensureWatchlistSummary = mutation({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<boolean> => {
    const existing = await readSummary(ctx, clerkUserId);
    if (existing) return true;

    await rebuildSummary(ctx, clerkUserId);
    return true;
  }
});

export const listWatchlist = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchlistGridWire[]> => {
    const summary = await readSummary(ctx, clerkUserId);
    if (summary) return summary.items as WatchlistGridWire[];

    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .collect();

    return items.map(toSummaryItem);
  }
});

export const listWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<string[]> => {
    const summary = await readSummary(ctx, clerkUserId);
    if (summary) return summary.contentIds;

    const items = await ctx.db
      .query("watchlist")
      .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .collect();

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
      genre: content.genre,
      posterUrl: content.posterUrl,
      tmdbId: content.tmdbId
    });

    const summary = await readSummary(ctx, clerkUserId);
    if (summary) {
      await writeSummary(ctx, clerkUserId, [
        toSnapshotSummaryItem({
          contentId,
          title: content.title,
          type: content.type,
          genre: content.genre,
          posterUrl: content.posterUrl,
          tmdbId: content.tmdbId
        }),
        ...(summary.items as WatchlistSummaryItem[]).filter((item) => item[0] !== contentId)
      ]);
    }

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

    const summary = await readSummary(ctx, clerkUserId);
    if (summary) {
      await writeSummary(
        ctx,
        clerkUserId,
        (summary.items as WatchlistSummaryItem[]).filter((item) => item[0] !== contentId)
      );
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

    const summary = await readSummary(ctx, clerkUserId);
    if (summary) {
      await writeSummary(
        ctx,
        clerkUserId,
        (summary.items as WatchlistSummaryItem[]).map((item) => {
          if (item[0] !== contentId) return item;
          const next = [...item] as WatchlistSummaryItem;
          next[5] = nextFolder ?? null;
          return next;
        })
      );
    }

    return true;
  }
});
