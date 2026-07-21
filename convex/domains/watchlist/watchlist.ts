import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "../../_generated/server";
import { fromImageWire, toImageWire, parseContentId } from "@content/contentMetadata";

const folderName = v.string();

function cleanFolder(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export const listWatchlist = query({
  args: {
    clerkUserId: v.string(),
    paginationOpts: paginationOptsValidator,
    folder: v.optional(v.union(v.string(), v.null()))
  },
  handler: async (ctx, { clerkUserId, paginationOpts, folder }) => {
    const baseQuery = ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watchlist_added", (q) =>
        q.eq("clerkUserId", clerkUserId).gt("watchlistAddedAt", 0)
      );
    const scopedQuery =
      folder === undefined
        ? baseQuery
        : baseQuery.filter((q) => q.eq(q.field("folder"), folder === null ? undefined : folder));
    const result = await scopedQuery.order("desc").paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map((item) => {
        const parsed = parseContentId(item.contentId);
        return {
          _id: item.contentId,
          title: item.title,
          type: parsed?.type || "movie",
          posterUrl: fromImageWire(item.posterUrl),
          tmdbId: parsed?.tmdbId || "",
          watchlistFolder: item.folder
        };
      })
    };
  }
});

export const listWatchlistContentIds = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const items = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watchlist_added", (q) =>
        q.eq("clerkUserId", clerkUserId).gt("watchlistAddedAt", 0)
      )
      .collect();
    return items.map((item) => ({
      id: item.contentId,
      tmdbId: parseContentId(item.contentId)?.tmdbId
    }));
  }
});

export const listFolders = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const entries = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watchlist_added", (q) =>
        q.eq("clerkUserId", clerkUserId).gt("watchlistAddedAt", 0)
      )
      .collect();
    return Array.from(
      new Set(entries.flatMap((entry) => (entry.folder ? [entry.folder] : [])))
    ).sort((a, b) => a.localeCompare(b));
  }
});

export const deleteFolder = mutation({
  args: { clerkUserId: v.string(), name: folderName },
  handler: async (ctx, { clerkUserId, name }) => {
    const normalized = cleanFolder(name);
    const entries = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watchlist_added", (q) =>
        q.eq("clerkUserId", clerkUserId).gt("watchlistAddedAt", 0)
      )
      .collect();
    await Promise.all(
      entries
        .filter((entry) => entry.folder === normalized)
        .map((entry) => ctx.db.patch(entry._id, { folder: undefined }))
    );
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
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", args.clerkUserId).eq("contentId", args.contentId)
      )
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        watchlistAddedAt: args.inWatchlist ? Date.now() : undefined,
        folder: args.inWatchlist ? existing.folder : undefined,
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
  }
});

export const setWatchlistFolder = mutation({
  args: { clerkUserId: v.string(), contentId: v.string(), folder: v.optional(folderName) },
  handler: async (ctx, { clerkUserId, contentId, folder }) => {
    const entry = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
      .first();
    if (!entry || !entry.watchlistAddedAt) throw new Error("Watchlist item not found");
    const normalized = folder ? cleanFolder(folder) : undefined;
    await ctx.db.patch(entry._id, { folder: normalized });
  }
});
