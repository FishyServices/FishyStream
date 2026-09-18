import { v } from "convex/values";
import { toImageWire } from "@content/contentMetadata";
import type { Id } from "../../_generated/dataModel";
import { viewerMutation } from "../../lib/auth";
import { isCompleted, progressPercent } from "../history/mediaStateModel";

const MIN_PROGRESS_DELTA = 5;
const MIN_POSITION_DELTA_SECONDS = 300;

const saveProgressArgs = {
  contentId: v.string(),
  title: v.string(),
  posterUrl: v.string(),
  progress: v.number(),
  completed: v.boolean(),
  positionSeconds: v.optional(v.number()),
  durationSeconds: v.optional(v.number()),
  seasonNumber: v.optional(v.number()),
  episodeNumber: v.optional(v.number()),
  source: v.optional(v.string()),
  dub: v.optional(v.boolean())
};

function clampProgress(value: number) {
  return Math.max(0, Math.min(100, value));
}

function requestedPosition(args: {
  completed: boolean;
  durationSeconds?: number;
  positionSeconds?: number;
}) {
  return args.completed && args.durationSeconds != null
    ? args.durationSeconds
    : args.positionSeconds;
}

function hasMeaningfulChange(
  existing: {
    positionSeconds?: number;
    durationSeconds?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    source?: string;
    dub?: boolean;
    title: string;
    posterUrl: string;
  },
  args: {
    progress: number;
    completed: boolean;
    positionSeconds?: number;
    durationSeconds?: number;
    seasonNumber?: number;
    episodeNumber?: number;
    source?: string;
    dub?: boolean;
    title: string;
    posterUrl: string;
  }
) {
  const currentProgress = progressPercent(existing);
  const currentCompleted = isCompleted(currentProgress);
  const nextPosition = requestedPosition(args);
  const positionDelta = Math.abs((existing.positionSeconds ?? 0) - (nextPosition ?? 0));

  return (
    currentCompleted !== args.completed ||
    positionDelta >= MIN_POSITION_DELTA_SECONDS ||
    Math.abs(currentProgress - args.progress) >= MIN_PROGRESS_DELTA ||
    existing.durationSeconds !== args.durationSeconds ||
    existing.seasonNumber !== args.seasonNumber ||
    existing.episodeNumber !== args.episodeNumber ||
    existing.source !== args.source ||
    existing.dub !== args.dub ||
    existing.title !== args.title ||
    existing.posterUrl !== args.posterUrl
  );
}

export const saveWatchProgress = viewerMutation({
  args: saveProgressArgs,
  handler: async (ctx, args): Promise<Id<"mediaState"> | null> => {
    const now = Date.now();
    const progress = clampProgress(args.progress);
    const completed = args.completed || progress >= 95;
    const storedPosterUrl = toImageWire(args.posterUrl);
    const existing = await ctx.db
      .query("mediaState")
      .withIndex("by_clerk_content", (q) =>
        q.eq("clerkUserId", ctx.viewerId).eq("contentId", args.contentId)
      )
      .first();

    const nextArgs = {
      ...args,
      progress,
      completed,
      posterUrl: storedPosterUrl
    };

    if (existing) {
      if ((existing.watchedAt ?? 0) > now) return existing._id;
      if (!hasMeaningfulChange(existing, nextArgs)) return existing._id;

      await ctx.db.patch(existing._id, {
        positionSeconds: requestedPosition(nextArgs),
        durationSeconds: args.durationSeconds,
        seasonNumber: args.seasonNumber,
        episodeNumber: args.episodeNumber,
        source: args.source,
        dub: args.dub,
        watchedAt: now,
        title: args.title,
        posterUrl: storedPosterUrl
      });
      return existing._id;
    }

    return ctx.db.insert("mediaState", {
      clerkUserId: ctx.viewerId,
      contentId: args.contentId,
      title: args.title,
      posterUrl: storedPosterUrl,
      positionSeconds: requestedPosition(nextArgs),
      durationSeconds: args.durationSeconds,
      seasonNumber: args.seasonNumber,
      episodeNumber: args.episodeNumber,
      source: args.source,
      dub: args.dub,
      watchedAt: now
    });
  }
});
