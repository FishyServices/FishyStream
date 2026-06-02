import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toWatchHistoryItemWire,
  toWatchProgressEntryMeta,
  type WatchHistoryItemWire,
  type WatchProgressEntryMeta
} from "../shared/contentMetadata";

const MIN_PROGRESS_DELTA_TO_WRITE = 5;
const MIN_POSITION_DELTA_TO_WRITE_SECONDS = 300;

type ProgressDocument = {
  progress: number;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  completed: boolean;
  watchedAt: number;
  clientUpdatedAt?: number;
  serverUpdatedAt?: number;
};

type ProgressWrite = {
  progressId?: Id<"watchProgress">;
  contentId: Id<"content">;
  progress: number;
  completed?: boolean;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  clientUpdatedAt?: number;
};

const progressWriteFields = {
  progressId: v.optional(v.id("watchProgress")),
  contentId: v.id("content"),
  progress: v.number(),
  completed: v.optional(v.boolean()),
  positionSeconds: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),
  seasonNumber: v.optional(v.number()),
  episodeNumber: v.optional(v.number()),
  source: v.optional(v.string()),
  dub: v.optional(v.boolean()),
  clientUpdatedAt: v.optional(v.number())
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
    positionDelta < MIN_POSITION_DELTA_TO_WRITE_SECONDS &&
    progressDelta < MIN_PROGRESS_DELTA_TO_WRITE &&
    (existing.durationSeconds ?? 0) === (next.durationSeconds ?? 0) &&
    existing.seasonNumber === next.seasonNumber &&
    existing.episodeNumber === next.episodeNumber &&
    existing.source === next.source &&
    existing.dub === next.dub
  );
}

function addChangedField<T extends keyof ProgressDocument>(
  patch: Partial<ProgressDocument>,
  existing: ProgressDocument,
  field: T,
  nextValue: ProgressDocument[T]
) {
  if (existing[field] !== nextValue) {
    patch[field] = nextValue;
  }
}

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

export const saveWatchProgress = mutation({
  args: {
    clerkUserId: v.string(),
    ...progressWriteFields
  },
  handler: async (ctx, args): Promise<Id<"watchProgress"> | null> => {
    return await saveProgressForUser(ctx, args.clerkUserId, args);
  }
});

async function saveProgressForUser(
  ctx: MutationCtx,
  clerkUserId: string,
  args: ProgressWrite,
  now = Date.now()
): Promise<Id<"watchProgress"> | null> {
  const normalizedProgress = normalizeProgress(args.progress);
  const completed = args.completed ?? normalizedProgress >= 95;
  const clientUpdatedAt = args.clientUpdatedAt ?? now;
  const nextPositionSeconds = normalizeOptionalNumber(args.positionSeconds);
  const nextDurationSeconds = normalizeOptionalNumber(args.durationSeconds);

  if (args.progressId) {
    await ctx.db.patch(args.progressId, {
      progress: normalizedProgress,
      completed,
      positionSeconds: nextPositionSeconds,
      durationSeconds: nextDurationSeconds,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      source: args.source,
      dub: args.dub,
      watchedAt: clientUpdatedAt,
      clientUpdatedAt,
      serverUpdatedAt: now
    });
    return args.progressId;
  }

  const existing = await ctx.db
    .query("watchProgress")
    .withIndex("by_clerk_content", (q) =>
      q.eq("clerkUserId", clerkUserId).eq("contentId", args.contentId)
    )
    .first();

  if (existing) {
    const existingClientUpdatedAt = existing.clientUpdatedAt ?? existing.watchedAt;
    if (clientUpdatedAt < existingClientUpdatedAt) {
      return existing._id;
    }

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
      return existing._id;
    }

    const patch: Partial<ProgressDocument> & {
      watchedAt: number;
      clientUpdatedAt: number;
      serverUpdatedAt: number;
    } = {
      watchedAt: clientUpdatedAt,
      clientUpdatedAt,
      serverUpdatedAt: now
    };
    addChangedField(patch, existing, "progress", nextState.progress);
    addChangedField(patch, existing, "completed", nextState.completed);
    addChangedField(patch, existing, "positionSeconds", nextState.positionSeconds);
    addChangedField(patch, existing, "durationSeconds", nextState.durationSeconds);
    addChangedField(patch, existing, "seasonNumber", nextState.seasonNumber);
    addChangedField(patch, existing, "episodeNumber", nextState.episodeNumber);
    addChangedField(patch, existing, "source", nextState.source);
    addChangedField(patch, existing, "dub", nextState.dub);

    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("watchProgress", {
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
    watchedAt: clientUpdatedAt,
    clientUpdatedAt,
    serverUpdatedAt: now
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
