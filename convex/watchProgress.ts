import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const MIN_PROGRESS_DELTA_TO_WRITE = 5;
const MIN_POSITION_DELTA_TO_WRITE_SECONDS = 300;

type ProgressDocument = {
  tmdbId: string;
  contentType: "movie" | "tv";
  title: string;
  posterUrl: string;
  genre?: string[];
  year?: number;
  voteAverage?: number;
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
};

type ProgressWrite = {
  progressId?: Id<"watchProgress">;
  contentId: string;
  snapshot: ProgressSnapshot;
  progress: number;
  completed: boolean;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  clientUpdatedAt?: number;
};

type ProgressSnapshot = {
  title: string;
  type: "movie" | "tv";
  posterUrl: string;
  tmdbId: string;
  genre?: string[];
  year?: number;
  voteAverage?: number;
};

function normalizeProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

function normalizeOptionalNumber(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? undefined : Math.max(0, value);
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

const progressSnapshotValidator = v.object({
  title: v.string(),
  type: v.union(v.literal("movie"), v.literal("tv")),
  posterUrl: v.string(),
  tmdbId: v.string(),
  genre: v.optional(v.array(v.string())),
  year: v.optional(v.number()),
  voteAverage: v.optional(v.number())
});

export const saveWatchProgress = mutation({
  args: {
    u: v.string(),
    contentId: v.string(),
    progress: v.number(),
    completed: v.boolean(),
    positionSeconds: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    source: v.optional(v.string()),
    dub: v.optional(v.boolean()),
    clientUpdatedAt: v.optional(v.number()),
    progressId: v.optional(v.string()),
    snapshot: progressSnapshotValidator
  },
  handler: async (ctx, args): Promise<Id<"watchProgress"> | null> => {
    const write: ProgressWrite = {
      progressId: (args.progressId || undefined) as Id<"watchProgress"> | undefined,
      contentId: args.contentId,
      snapshot: args.snapshot,
      progress: args.progress,
      completed: args.completed,
      positionSeconds: args.positionSeconds,
      durationSeconds: args.durationSeconds,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      source: args.source,
      dub: args.dub,
      clientUpdatedAt: args.clientUpdatedAt
    };
    return await saveProgressForUser(ctx, args.u, write);
  }
});

async function saveProgressForUser(
  ctx: MutationCtx,
  clerkUserId: string,
  args: ProgressWrite,
  now = Date.now()
): Promise<Id<"watchProgress"> | null> {
  const normalizedProgress = normalizeProgress(args.progress);
  const completed = args.completed || normalizedProgress >= 95;
  const clientUpdatedAt = args.clientUpdatedAt ?? now;
  const nextPositionSeconds = normalizeOptionalNumber(args.positionSeconds);
  const nextDurationSeconds = normalizeOptionalNumber(args.durationSeconds);

  if (args.progressId) {
    const existingById = await ctx.db.get(args.progressId);
    if (existingById && existingById.clerkUserId === clerkUserId) {
      const existingClientUpdatedAt = existingById.clientUpdatedAt ?? existingById.watchedAt;
      if (clientUpdatedAt < existingClientUpdatedAt) {
        return existingById._id;
      }

      const nextState = {
        progress: normalizedProgress,
        completed,
        positionSeconds: nextPositionSeconds ?? existingById.positionSeconds,
        durationSeconds: nextDurationSeconds ?? existingById.durationSeconds,
        seasonNumber: args.seasonNumber ?? existingById.seasonNumber,
        episodeNumber: args.episodeNumber ?? existingById.episodeNumber,
        source: args.source ?? existingById.source,
        dub: args.dub ?? existingById.dub
      };

      if (shouldSkipProgressUpdate(existingById, nextState)) {
        return existingById._id;
      }

      const patch: Partial<ProgressDocument> & {
        watchedAt: number;
        clientUpdatedAt: number;
      } = {
        watchedAt: clientUpdatedAt,
        clientUpdatedAt,
        tmdbId: args.snapshot.tmdbId,
        contentType: args.snapshot.type,
        title: args.snapshot.title,
        posterUrl: args.snapshot.posterUrl,
        genre: args.snapshot.genre,
        year: args.snapshot.year,
        voteAverage: args.snapshot.voteAverage
      };
      if (existingById.progress !== nextState.progress) patch.progress = nextState.progress;
      if (existingById.completed !== nextState.completed) patch.completed = nextState.completed;
      if (existingById.positionSeconds !== nextState.positionSeconds) {
        patch.positionSeconds = nextState.positionSeconds;
      }
      if (existingById.durationSeconds !== nextState.durationSeconds) {
        patch.durationSeconds = nextState.durationSeconds;
      }
      if (existingById.seasonNumber !== nextState.seasonNumber) {
        patch.seasonNumber = nextState.seasonNumber;
      }
      if (existingById.episodeNumber !== nextState.episodeNumber) {
        patch.episodeNumber = nextState.episodeNumber;
      }
      if (existingById.source !== nextState.source) patch.source = nextState.source;
      if (existingById.dub !== nextState.dub) patch.dub = nextState.dub;

      await ctx.db.patch(existingById._id, patch);
      return existingById._id;
    }
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
    } = {
      watchedAt: clientUpdatedAt,
      clientUpdatedAt,
      tmdbId: args.snapshot.tmdbId,
      contentType: args.snapshot.type,
      title: args.snapshot.title,
      posterUrl: args.snapshot.posterUrl,
      genre: args.snapshot.genre,
      year: args.snapshot.year,
      voteAverage: args.snapshot.voteAverage
    };
    if (existing.progress !== nextState.progress) patch.progress = nextState.progress;
    if (existing.completed !== nextState.completed) patch.completed = nextState.completed;
    if (existing.positionSeconds !== nextState.positionSeconds) {
      patch.positionSeconds = nextState.positionSeconds;
    }
    if (existing.durationSeconds !== nextState.durationSeconds) {
      patch.durationSeconds = nextState.durationSeconds;
    }
    if (existing.seasonNumber !== nextState.seasonNumber)
      patch.seasonNumber = nextState.seasonNumber;
    if (existing.episodeNumber !== nextState.episodeNumber) {
      patch.episodeNumber = nextState.episodeNumber;
    }
    if (existing.source !== nextState.source) patch.source = nextState.source;
    if (existing.dub !== nextState.dub) patch.dub = nextState.dub;

    await ctx.db.patch(existing._id, patch);
    return existing._id;
  }

  return await ctx.db.insert("watchProgress", {
    clerkUserId,
    contentId: args.contentId,
    tmdbId: args.snapshot.tmdbId,
    contentType: args.snapshot.type,
    title: args.snapshot.title,
    posterUrl: args.snapshot.posterUrl,
    genre: args.snapshot.genre,
    year: args.snapshot.year,
    voteAverage: args.snapshot.voteAverage,
    progress: normalizedProgress,
    completed,
    positionSeconds: nextPositionSeconds,
    durationSeconds: nextDurationSeconds,
    seasonNumber: args.seasonNumber,
    episodeNumber: args.episodeNumber,
    source: args.source,
    dub: args.dub,
    watchedAt: clientUpdatedAt,
    clientUpdatedAt
  });
}

