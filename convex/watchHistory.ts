import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  fromImageWire,
  type WatchHistoryItemMeta,
  type WatchProgressEntryMeta
} from "../shared/contentMetadata";

function toHistoryItem(row: Doc<"watchProgress">): WatchHistoryItemMeta {
  return {
    _id: row.contentId as never,
    title: row.title,
    type: row.contentType,
    genre: row.genre ?? [],
    year: row.year ?? 0,
    voteAverage: row.voteAverage,
    posterUrl: fromImageWire(row.posterUrl),
    tmdbId: row.tmdbId,
    new: false,
    progress: row.progress,
    completed: row.completed,
    seasonNumber: row.seasonNumber ?? undefined,
    episodeNumber: row.episodeNumber ?? undefined,
    source: row.source ?? undefined,
    dub: row.dub ?? undefined
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
        .query("watchProgress")
        .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", clerkUserId))
        .order("desc")
        .take(limit)
    : await ctx.db
        .query("watchProgress")
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
      .query("watchProgress")
      .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(75);

    return rows.map((row) => ({
      contentId: row.contentId as never,
      progress: row.progress,
      positionSeconds: row.positionSeconds ?? 0,
      durationSeconds: row.durationSeconds ?? 0,
      completed: row.completed,
      watchedAt: row.watchedAt,
      seasonNumber: row.seasonNumber ?? undefined,
      episodeNumber: row.episodeNumber ?? undefined,
      source: row.source ?? undefined,
      dub: row.dub ?? undefined,
      progressId: row._id
    }));
  }
});

export const removeWatchHistoryEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.string() },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const existingProgress = await ctx.db
      .query("watchProgress")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", clerkUserId).eq("contentId", contentId)
      )
      .first();
    if (!existingProgress) return false;

    await ctx.db.delete(existingProgress._id);
    return true;
  }
});
