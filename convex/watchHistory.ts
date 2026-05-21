import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { toWatchHistoryItemMeta, type WatchHistoryItemMeta } from "../shared/contentMetadata";
import { findOrCreateUserIdByClerkId, findUserIdByClerkIdQuery } from "./lib/users";
import { buildContentSnapshot, hasContentSnapshot } from "./lib/contentSnapshots";

function normalizeProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function normalizeOptionalNumber(value: number | undefined) {
  return value === undefined ? undefined : Math.max(0, value);
}

function shouldSkipProgressUpdate(
  existing: Doc<"watchHistory">,
  next: {
    progress: number;
    completed: boolean;
    positionSeconds?: number;
    durationSeconds?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    source?: string;
    dub?: boolean;
  }
) {
  const positionDelta = Math.abs((existing.positionSeconds ?? 0) - (next.positionSeconds ?? 0));
  const progressDelta = Math.abs(existing.progress - next.progress);

  return (
    existing.completed === next.completed &&
    positionDelta < 5 &&
    progressDelta < 1 &&
    (existing.durationSeconds ?? 0) === (next.durationSeconds ?? 0) &&
    existing.seasonNumber === next.seasonNumber &&
    existing.episodeNumber === next.episodeNumber &&
    existing.source === next.source &&
    existing.dub === next.dub
  );
}

function toSnapshotBackedHistoryItem(item: Doc<"watchHistory">, content?: Doc<"content"> | null) {
  const base = content
    ? {
        _id: content._id,
        title: content.title,
        type: content.type,
        genre: content.genre,
        year: content.year,
        rating: content.rating,
        voteAverage: content.voteAverage,
        posterUrl: content.posterUrl,
        tmdbId: content.tmdbId,
        new: content.new
      }
    : {
        _id: item.contentId,
        title: item.title!,
        type: item.contentType!,
        genre: item.genre!,
        year: item.year!,
        rating: item.rating!,
        voteAverage: item.voteAverage,
        posterUrl: item.posterUrl!,
        tmdbId: item.tmdbId,
        new: item.new!
      };

  return toWatchHistoryItemMeta({
    ...base,
    progress: item.progress,
    completed: item.completed,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    source: item.source,
    dub: item.dub
  });
}

async function queryUserId(ctx: QueryCtx, clerkUserId: string) {
  return await findUserIdByClerkIdQuery(ctx, clerkUserId);
}

async function mutateUserId(ctx: MutationCtx, clerkUserId: string) {
  return await findOrCreateUserIdByClerkId(ctx, clerkUserId);
}

async function listSnapshotBackedHistory(
  ctx: QueryCtx,
  userId: Id<"users">,
  limit: number,
  includeCompleted: boolean
) {
  const rows = includeCompleted
    ? await ctx.db
        .query("watchHistory")
        .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
        .order("desc")
        .take(limit)
    : await ctx.db
        .query("watchHistory")
        .withIndex("by_user_completed_watched_at", (q) =>
          q.eq("userId", userId).eq("completed", false)
        )
        .order("desc")
        .take(limit);

  const result: WatchHistoryItemMeta[] = [];
  for (const row of rows) {
    let content: Doc<"content"> | null = null;
    if (!hasContentSnapshot(row)) {
      content = await ctx.db.get(row.contentId);
      if (!content) continue;
    }

    result.push(toSnapshotBackedHistoryItem(row, content));
  }

  return result;
}

export const listWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemMeta[]> => {
    const userId = await queryUserId(ctx, clerkUserId);
    if (!userId) return [];
    return await listSnapshotBackedHistory(ctx, userId, 50, true);
  }
});

export const listContinueWatching = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemMeta[]> => {
    const userId = await queryUserId(ctx, clerkUserId);
    if (!userId) return [];
    return await listSnapshotBackedHistory(ctx, userId, 10, false);
  }
});

export const listWatchProgressEntries = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    const userId = await queryUserId(ctx, clerkUserId);
    if (!userId) return [];

    const rows = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    return rows.map((row) => ({
      contentId: row.contentId,
      progress: row.progress,
      positionSeconds: row.positionSeconds ?? 0,
      durationSeconds: row.durationSeconds ?? 0,
      completed: row.completed,
      seasonNumber: row.seasonNumber ?? null,
      episodeNumber: row.episodeNumber ?? null,
      source: row.source ?? null,
      dub: row.dub ?? null,
      watchedAt: row.watchedAt
    }));
  }
});

export const saveWatchProgress = mutation({
  args: {
    clerkUserId: v.string(),
    contentId: v.id("content"),
    progress: v.number(),
    completed: v.optional(v.boolean()),
    positionSeconds: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    source: v.optional(v.string()),
    dub: v.optional(v.boolean())
  },
  handler: async (ctx, args): Promise<void> => {
    const userId = await mutateUserId(ctx, args.clerkUserId);
    if (!userId) throw new Error("User not found");

    const normalizedProgress = normalizeProgress(args.progress);
    const completed = args.completed ?? normalizedProgress >= 95;
    const nextPositionSeconds = normalizeOptionalNumber(args.positionSeconds);
    const nextDurationSeconds = normalizeOptionalNumber(args.durationSeconds);
    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", args.contentId))
      .first();

    if (existing) {
      const nextState = {
        progress: normalizedProgress,
        completed,
        positionSeconds: nextPositionSeconds ?? existing.positionSeconds,
        durationSeconds: nextDurationSeconds ?? existing.durationSeconds,
        seasonNumber: args.seasonNumber ?? existing.seasonNumber,
        episodeNumber: args.episodeNumber ?? existing.episodeNumber,
        source: args.source ?? existing.source,
        dub: args.dub ?? existing.dub
      };

      if (shouldSkipProgressUpdate(existing, nextState)) {
        return;
      }

      await ctx.db.patch(existing._id, {
        ...nextState,
        watchedAt: Date.now()
      });
      return;
    }

    const content = await ctx.db.get(args.contentId);
    await ctx.db.insert("watchHistory", {
      userId,
      contentId: args.contentId,
      progress: normalizedProgress,
      completed,
      positionSeconds: nextPositionSeconds,
      durationSeconds: nextDurationSeconds,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      source: args.source,
      dub: args.dub,
      watchedAt: Date.now(),
      ...(content ? buildContentSnapshot(content) : {})
    });
  }
});

export const removeWatchHistoryEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await mutateUserId(ctx, clerkUserId);
    if (!userId) return false;

    const existing = await ctx.db
      .query("watchHistory")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();
    if (!existing) return false;

    await ctx.db.delete(existing._id);
    return true;
  }
});

export const compactWatchHistorySnapshots = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 5000 }) => {
    const items = await ctx.db.query("watchHistory").take(limit);
    let updated = 0;

    for (const item of items) {
      const content = await ctx.db.get(item.contentId);
      if (!content) continue;

      await ctx.db.patch(item._id, buildContentSnapshot(content));
      updated += 1;
    }

    return updated;
  }
});
