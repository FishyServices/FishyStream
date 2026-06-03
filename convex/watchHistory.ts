import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  toWatchHistoryItemWire,
  toWatchProgressEntryMeta,
  type WatchHistoryItemWire,
  type WatchProgressEntryMeta
} from "../shared/contentMetadata";

function toHistoryItemWire(
  row: Doc<"watchProgress">,
  content: Doc<"content"> | null
): WatchHistoryItemWire | null {
  if (!content) return null;

  return toWatchHistoryItemWire({
    _id: row.contentId,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new,
    progress: row.progress,
    completed: row.completed,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    source: row.source,
    dub: row.dub
  });
}

async function listHydratedHistory(
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

  const contentRows = await Promise.all(progressRows.map((row) => ctx.db.get(row.contentId)));
  return progressRows
    .map((row, index) => toHistoryItemWire(row, contentRows[index] ?? null))
    .filter((item): item is WatchHistoryItemWire => item !== null);
}

export const listWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemWire[]> => {
    return await listHydratedHistory(ctx, clerkUserId, 50, true);
  }
});

export const listContinueWatching = query({
  args: { clerkUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { clerkUserId, limit = 6 }): Promise<WatchHistoryItemWire[]> => {
    return await listHydratedHistory(ctx, clerkUserId, Math.max(1, Math.min(10, limit)), false);
  }
});

export const listWatchProgressEntries = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchProgressEntryMeta[]> => {
    const rows = await ctx.db
      .query("watchProgress")
      .withIndex("by_clerk_watched_at", (q) => q.eq("clerkUserId", clerkUserId))
      .order("desc")
      .take(50);

    return rows.map(toWatchProgressEntryMeta);
  }
});

export const removeWatchHistoryEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
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
