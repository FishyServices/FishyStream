import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toWatchHistoryItemWire,
  toWatchProgressEntryMeta,
  type WatchHistoryItemWire,
  type WatchProgressEntryMeta
} from "../shared/contentMetadata";
import { buildContentSnapshot } from "./lib/contentSnapshots";

type ProgressDocument = {
  progress: number;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  completed: boolean;
};

const progressWriteFields = {
  contentId: v.id("content"),
  progress: v.number(),
  completed: v.optional(v.boolean()),
  positionSeconds: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),
  seasonNumber: v.optional(v.number()),
  episodeNumber: v.optional(v.number()),
  source: v.optional(v.string()),
  dub: v.optional(v.boolean())
};

const progressWriteValidator = v.object(progressWriteFields);

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
    positionDelta < 60 &&
    progressDelta < 5 &&
    (existing.durationSeconds ?? 0) === (next.durationSeconds ?? 0) &&
    existing.seasonNumber === next.seasonNumber &&
    existing.episodeNumber === next.episodeNumber &&
    existing.source === next.source &&
    existing.dub === next.dub
  );
}

async function listSnapshotBackedHistory(
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

  return progressRows.map((row) =>
    toWatchHistoryItemWire({
      _id: row.contentId,
      title: row.title,
      type: row.contentType,
      genre: row.genre,
      year: row.year,
      voteAverage: row.voteAverage,
      posterUrl: row.posterUrl,
      tmdbId: row.tmdbId,
      new: row.new,
      progress: row.progress,
      completed: row.completed,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      source: row.source,
      dub: row.dub
    })
  );
}

export const listWatchHistory = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }): Promise<WatchHistoryItemWire[]> => {
    return await listSnapshotBackedHistory(ctx, clerkUserId, 50, true);
  }
});

export const listContinueWatching = query({
  args: { clerkUserId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { clerkUserId, limit = 6 }): Promise<WatchHistoryItemWire[]> => {
    return await listSnapshotBackedHistory(ctx, clerkUserId, Math.max(1, Math.min(10, limit)), false);
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

export const saveWatchProgress = mutation({
  args: {
    clerkUserId: v.string(),
    ...progressWriteFields
  },
  handler: async (ctx, args): Promise<void> => {
    await saveProgressForUser(ctx, args.clerkUserId, args);
  }
});

export const saveWatchProgressBatch = mutation({
  args: {
    clerkUserId: v.string(),
    entries: v.array(progressWriteValidator)
  },
  handler: async (ctx, { clerkUserId, entries }): Promise<void> => {
    for (const entry of entries.slice(0, 25)) {
      await saveProgressForUser(ctx, clerkUserId, entry);
    }
  }
});

async function saveProgressForUser(
  ctx: MutationCtx,
  clerkUserId: string,
  args: {
    contentId: Id<"content">;
    progress: number;
    completed?: boolean;
    positionSeconds?: number;
    durationSeconds?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    source?: string;
    dub?: boolean;
  }
) {
  const normalizedProgress = normalizeProgress(args.progress);
  const completed = args.completed ?? normalizedProgress >= 95;
  const nextPositionSeconds = normalizeOptionalNumber(args.positionSeconds);
  const nextDurationSeconds = normalizeOptionalNumber(args.durationSeconds);
  const existing = await ctx.db
    .query("watchProgress")
    .withIndex("by_clerk_content", (q) =>
      q.eq("clerkUserId", clerkUserId).eq("contentId", args.contentId)
    )
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
  if (!content) return;

  await ctx.db.insert("watchProgress", {
    clerkUserId,
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
    ...buildContentSnapshot(content)
  });
}

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

export const compactWatchProgressSnapshots = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async () => {
    return 0;
  }
});
