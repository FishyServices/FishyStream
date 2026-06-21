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

const HAS_DURATION = 1;
const HAS_SEASON = 1 << 1;
const HAS_EPISODE = 1 << 2;
const HAS_SOURCE = 1 << 3;
const DUB_TRUE = 1 << 4;
const DUB_FALSE = 1 << 5;

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

function decodeProgressWrite(payload: unknown[], snapshot: ProgressSnapshot): ProgressWrite {
  const flags = Number(payload[5] ?? 0);
  let index = 6;
  const nextOptionalNumber = () => normalizeOptionalNumber(Number(payload[index++]));

  return {
    progressId: (payload[0] || undefined) as Id<"watchProgress"> | undefined,
    contentId: String(payload[1]),
    snapshot,
    progress: Number(payload[2] ?? 0),
    completed: payload[3] === 1,
    positionSeconds: normalizeOptionalNumber(Number(payload[4] ?? 0)),
    clientUpdatedAt: normalizeOptionalNumber(Number(payload[index++] ?? Date.now())),
    durationSeconds: flags & HAS_DURATION ? nextOptionalNumber() : undefined,
    seasonNumber: flags & HAS_SEASON ? nextOptionalNumber() : undefined,
    episodeNumber: flags & HAS_EPISODE ? nextOptionalNumber() : undefined,
    source: flags & HAS_SOURCE ? String(payload[index++]) : undefined,
    dub: flags & DUB_TRUE ? true : flags & DUB_FALSE ? false : undefined
  };
}

export const saveWatchProgress = mutation({
  args: {
    u: v.string(),
    p: v.array(v.any()),
    snapshot: progressSnapshotValidator
  },
  handler: async (ctx, args): Promise<Id<"watchProgress"> | null> => {
    return await saveProgressForUser(ctx, args.u, decodeProgressWrite(args.p, args.snapshot));
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
