import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { viewerMutation, viewerQuery } from "../../lib/auth";
import type { Doc } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  fromImageWire,
  parseContentId,
  type WatchHistoryItemMeta,
  type WatchProgressEntryMeta
} from "@content/contentMetadata";

function toHistoryItem(row: Doc<"mediaState">): WatchHistoryItemMeta {
  const parsed = parseContentId(row.contentId);
  const progress =
    row.durationSeconds && row.positionSeconds
      ? (row.positionSeconds / row.durationSeconds) * 100
      : 0;

  return {
    _id: row.contentId as never,
    title: row.title,
    type: parsed?.type || "movie",
    posterUrl: fromImageWire(row.posterUrl),
    tmdbId: parsed?.tmdbId || "",
    new: false,
    progress,
    completed: progress >= 95,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    source: row.source,
    dub: row.dub
  };
}

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const MAX_SEARCH_ROWS = 300;

async function listHistory(
  ctx: QueryCtx,
  clerkUserId: string,
  limit: number,
  includeCompleted: boolean
) {
  const progressRows = includeCompleted
    ? await ctx.db
        .query("mediaState")
        .withIndex("by_clerk_watched_at", (q) =>
          q.eq("clerkUserId", clerkUserId).gt("watchedAt", 0)
        )
        .order("desc")
        .take(limit)
    : (
        await ctx.db
          .query("mediaState")
          .withIndex("by_clerk_watched_at", (q) =>
            q.eq("clerkUserId", clerkUserId).gt("watchedAt", 0)
          )
          .order("desc")
          .take(limit * 3)
      )
        .filter((row) => {
          const progress =
            row.durationSeconds && row.positionSeconds
              ? (row.positionSeconds / row.durationSeconds) * 100
              : 0;
          return progress < 95;
        })
        .slice(0, limit);

  return progressRows.map(toHistoryItem);
}

export const listWatchHistory = viewerQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }): Promise<WatchHistoryItemMeta[]> => {
    return await listHistory(ctx, ctx.viewerId, Math.max(1, Math.min(100, limit)), true);
  }
});

export const listWatchHistoryPage = viewerQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string())
  },
  handler: async (ctx, { paginationOpts, search }) => {
    const clerkUserId = ctx.viewerId;
    const normalizedSearch = search?.trim() ? normalizeTitle(search) : "";
    const historyQuery = ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", clerkUserId).gt("watchedAt", 0))
      .order("desc");

    if (normalizedSearch) {
      const matches = (await historyQuery.take(MAX_SEARCH_ROWS)).filter((row) =>
        normalizeTitle(row.title).includes(normalizedSearch)
      );
      const start = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor);
      const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
      const end = safeStart + paginationOpts.numItems;

      return {
        page: matches.slice(safeStart, end).map(toHistoryItem),
        isDone: end >= matches.length,
        continueCursor: String(end)
      };
    }

    const result = await historyQuery.paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map(toHistoryItem)
    };
  }
});

export const listContinueWatching = viewerQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 6 }): Promise<WatchHistoryItemMeta[]> => {
    return await listHistory(ctx, ctx.viewerId, Math.max(1, Math.min(30, limit)), false);
  }
});

export const listWatchProgressEntries = viewerQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }): Promise<WatchProgressEntryMeta[]> => {
    const clerkUserId = ctx.viewerId;
    const fetchLimit = Math.max(1, Math.min(100, limit));
    const rows = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", clerkUserId).gt("watchedAt", 0))
      .order("desc")
      .take(fetchLimit);

    return rows.map((row) => {
      const progress =
        row.durationSeconds && row.positionSeconds
          ? (row.positionSeconds / row.durationSeconds) * 100
          : 0;

      return {
        contentId: row.contentId as never,
        progress,
        positionSeconds: row.positionSeconds ?? 0,
        durationSeconds: row.durationSeconds ?? 0,
        completed: progress >= 95,
        watchedAt: row.watchedAt ?? 0,
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
        source: row.source,
        dub: row.dub
      };
    });
  }
});

export const removeWatchHistoryEntry = viewerMutation({
  args: { contentId: v.string() },
  handler: async (ctx, { contentId }): Promise<boolean> => {
    const existing = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", ctx.viewerId).eq("contentId", contentId)
      )
      .first();
    if (!existing) return false;

    await ctx.db.delete(existing._id);

    return true;
  }
});

export const clearWatchHistory = viewerMutation({
  args: {},
  handler: async (ctx): Promise<number> => {
    const entries = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", ctx.viewerId).gt("watchedAt", 0))
      .collect();

    for (const entry of entries) {
      await ctx.db.delete(entry._id);
    }

    return entries.length;
  }
});
