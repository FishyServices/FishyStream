import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toContentBackedWatchHistoryItemMeta,
  toWatchHistoryItemWire,
  toWatchProgressEntryMeta,
  type WatchHistoryItemWire,
  type WatchProgressEntryMeta
} from "../shared/contentMetadata";
import { findOrCreateUserIdByClerkId, findUserIdByClerkIdQuery } from "./lib/users";

type ProgressDocument = {
  contentId: Id<"content">;
  progress: number;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  completed: boolean;
  watchedAt: number;
};

function normalizeProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function normalizeOptionalNumber(value: number | undefined) {
  return value === undefined ? undefined : Math.max(0, value);
}

function shouldSkipProgressUpdate(
  existing: ProgressDocument,
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

async function queryUserId(ctx: QueryCtx, clerkUserId: string) {
  return await findUserIdByClerkIdQuery(ctx, clerkUserId);
}

async function mutateUserId(ctx: MutationCtx, clerkUserId: string) {
  return await findOrCreateUserIdByClerkId(ctx, clerkUserId);
}

async function getContentCard(ctx: QueryCtx, contentId: Id<"content">) {
  const card = await ctx.db
    .query("contentCards")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .first();

  if (card) {
    return {
      _id: card.contentId,
      title: card.title,
      type: card.type,
      genre: card.genre,
      year: card.year,
      voteAverage: card.voteAverage,
      posterUrl: card.posterUrl,
      tmdbId: card.tmdbId,
      new: card.new
    };
  }

  const content = await ctx.db.get(contentId);
  if (!content) return null;

  return {
    _id: content._id,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new
  };
}

async function listSnapshotBackedHistory(
  ctx: QueryCtx,
  userId: Id<"users">,
  limit: number,
  includeCompleted: boolean
) {
  const progressRows = includeCompleted
    ? await ctx.db
        .query("watchProgress")
        .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
        .order("desc")
        .take(limit)
    : await ctx.db
        .query("watchProgress")
        .withIndex("by_user_completed_watched_at", (q) =>
          q.eq("userId", userId).eq("completed", false)
        )
        .order("desc")
        .take(limit);

  const result: WatchHistoryItemWire[] = [];

  for (const row of progressRows) {
    const content = await getContentCard(ctx, row.contentId);
    if (!content) continue;

    result.push(toWatchHistoryItemWire(toContentBackedWatchHistoryItemMeta(row, content)));
  }

  return result;
}

export const listWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemWire[]> => {
    const userId = await queryUserId(ctx, clerkUserId);
    if (!userId) return [];
    return await listSnapshotBackedHistory(ctx, userId, 50, true);
  }
});

export const listContinueWatching = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemWire[]> => {
    const userId = await queryUserId(ctx, clerkUserId);
    if (!userId) return [];
    return await listSnapshotBackedHistory(ctx, userId, 10, false);
  }
});

export const listWatchProgressEntries = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchProgressEntryMeta[]> => {
    const userId = await queryUserId(ctx, clerkUserId);
    if (!userId) return [];

    const rows = await ctx.db
      .query("watchProgress")
      .withIndex("by_user_watched_at", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);

    return rows.map(toWatchProgressEntryMeta);
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
      .query("watchProgress")
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

    await ctx.db.insert("watchProgress", {
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
      watchedAt: Date.now()
    });
  }
});

export const removeWatchHistoryEntry = mutation({
  args: { clerkUserId: v.string(), contentId: v.id("content") },
  handler: async (ctx, { clerkUserId, contentId }): Promise<boolean> => {
    const userId = await mutateUserId(ctx, clerkUserId);
    if (!userId) return false;

    const existingProgress = await ctx.db
      .query("watchProgress")
      .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
      .first();
    if (!existingProgress) return false;

    await ctx.db.delete(existingProgress._id);
    return true;
  }
});
