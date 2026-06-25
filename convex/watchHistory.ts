import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  fromImageWire,
  type WatchHistoryItemMeta,
  type WatchProgressEntryMeta
} from "../shared/contentMetadata";

function toHistoryItem(row: Doc<"mediaState">): WatchHistoryItemMeta {
  return {
    _id: row.contentId as never,
    title: row.title,
    type: row.contentType,
    posterUrl: fromImageWire(row.posterUrl),
    tmdbId: row.tmdbId,
    new: false,
    progress: row.progress ?? 0,
    completed: row.completed ?? false,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    source: row.source,
    dub: row.dub
  };
}

async function listHistory(
  ctx: QueryCtx,
  clerkUserId: string,
  limit: number,
  includeCompleted: boolean
) {
  const progressRows = includeCompleted
    ? await ctx.db
        .query("mediaState")
        .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", clerkUserId))
        .order("desc")
        .take(limit)
    : await ctx.db
        .query("mediaState")
        .withIndex("by_clerk_completed_watched_at", (q) =>
          q.eq("clerkUserId", clerkUserId).eq("completed", false)
        )
        .order("desc")
        .take(limit);

  return progressRows.map(toHistoryItem);
}

export const listWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemMeta[]> => {
    return await listHistory(ctx, clerkUserId, 100, true);
  }
});

export const listContinueWatching = query({
  args: { clerkUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { clerkUserId, limit = 6 }): Promise<WatchHistoryItemMeta[]> => {
    return await listHistory(ctx, clerkUserId, Math.max(1, Math.min(30, limit)), false);
  }
});

export const listWatchProgressEntries = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchProgressEntryMeta[]> => {
    const rows = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(75);

    return rows.map((row) => ({
      contentId: row.contentId as never,
      progress: row.progress ?? 0,
      positionSeconds: row.positionSeconds ?? 0,
      durationSeconds: row.durationSeconds ?? 0,
      completed: row.completed ?? false,
      watchedAt: row.watchedAt ?? 0,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      source: row.source,
      dub: row.dub
    }));
  }
});

export const removeWatchHistoryEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.string() },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const existing = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
      .first();
    if (!existing) return false;

    if (existing.inWatchlist) {
      await ctx.db.patch(existing._id, {
        progress: undefined,
        completed: undefined,
        positionSeconds: undefined,
        durationSeconds: undefined,
        seasonNumber: undefined,
        episodeNumber: undefined,
        source: undefined,
        dub: undefined,
        watchedAt: undefined
      });
    } else {
      await ctx.db.delete(existing._id);
    }
    
    return true;
  }
});
