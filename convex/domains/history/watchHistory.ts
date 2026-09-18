import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { stream } from "convex-helpers/server/stream";
import { viewerMutation, viewerQuery } from "../../lib/auth";
import type { QueryCtx } from "../../_generated/server";
import schema from "../../schema";
import {
  isCompleted,
  normalizeLimit,
  normalizeSearch,
  progressPercent,
  toHistoryItem,
  toProgressEntry
} from "./mediaStateModel";
import type { WatchHistoryItemMeta, WatchProgressEntryMeta } from "@content/contentMetadata";

const MAX_SEARCH_ROWS = 300;

function historyQuery(ctx: QueryCtx, viewerId: string) {
  return ctx.db
    .query("mediaState")
    .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", viewerId).gt("watchedAt", 0))
    .order("desc");
}

function historyStream(ctx: QueryCtx, viewerId: string) {
  return stream(ctx.db, schema)
    .query("mediaState")
    .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", viewerId).gt("watchedAt", 0))
    .order("desc");
}

function compact<T>(items: Array<T | null>): T[] {
  return items.filter((item): item is T => item !== null);
}

async function listHistoryRows(
  ctx: QueryCtx,
  viewerId: string,
  limit: number,
  includeCompleted: boolean
) {
  const rows = includeCompleted
    ? await historyQuery(ctx, viewerId).take(limit)
    : await historyStream(ctx, viewerId)
        .filterWith(async (row) => !isCompleted(progressPercent(row)))
        .take(limit);

  return compact(rows.map(toHistoryItem));
}

export const listWatchHistory = viewerQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<WatchHistoryItemMeta[]> =>
    listHistoryRows(ctx, ctx.viewerId, normalizeLimit(limit, 20, 100), true)
});

export const listWatchHistoryPage = viewerQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string())
  },
  handler: async (ctx, { paginationOpts, search }) => {
    const normalizedSearch = normalizeSearch(search);
    if (normalizedSearch) {
      const matches = await historyStream(ctx, ctx.viewerId)
        .filterWith(async (row) => normalizeSearch(row.title).includes(normalizedSearch))
        .take(MAX_SEARCH_ROWS);
      const start = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor);
      const safeStart = Number.isFinite(start) && start >= 0 ? start : 0;
      const end = safeStart + paginationOpts.numItems;

      return {
        page: compact(matches.slice(safeStart, end).map(toHistoryItem)),
        isDone: end >= matches.length,
        continueCursor: String(end)
      };
    }

    const result = await historyQuery(ctx, ctx.viewerId).paginate(paginationOpts);
    return { ...result, page: compact(result.page.map(toHistoryItem)) };
  }
});

export const listContinueWatching = viewerQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<WatchHistoryItemMeta[]> =>
    listHistoryRows(ctx, ctx.viewerId, normalizeLimit(limit, 6, 30), false)
});

export const listWatchProgressEntries = viewerQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }): Promise<WatchProgressEntryMeta[]> => {
    const rows = await historyQuery(ctx, ctx.viewerId).take(normalizeLimit(limit, 20, 100));
    return compact(rows.map(toProgressEntry));
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
    const entries = await historyQuery(ctx, ctx.viewerId).collect();
    await Promise.all(entries.map((entry) => ctx.db.delete(entry._id)));
    return entries.length;
  }
});
