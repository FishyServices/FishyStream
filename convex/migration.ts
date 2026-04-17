import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const importedMediaValidator = v.object({
  tmdbId: v.string(),
  title: v.string(),
  year: v.optional(v.number()),
  posterUrl: v.optional(v.string()),
  type: v.union(v.literal("movie"), v.literal("tv"))
});

const importedPlaybackValidator = v.object({
  tmdbId: v.string(),
  title: v.string(),
  year: v.optional(v.number()),
  posterUrl: v.optional(v.string()),
  type: v.union(v.literal("movie"), v.literal("tv")),
  watched: v.number(),
  duration: v.number(),
  timestamp: v.number(),
  completed: v.boolean(),
  seasonNumber: v.optional(v.number()),
  episodeNumber: v.optional(v.number())
});

type ImportedMedia = {
  tmdbId: string;
  title: string;
  year?: number;
  posterUrl?: string;
  type: "movie" | "tv";
};

type ImportedPlayback = ImportedMedia & {
  watched: number;
  duration: number;
  timestamp: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
};

async function getOrCreateUserId(ctx: MutationCtx, clerkUserId: string): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .unique();

  if (existing) {
    return existing._id;
  }

  return ctx.db.insert("users", {
    clerkUserId,
    email: undefined,
    name: undefined,
    createdAt: Date.now()
  });
}

function normalizeProgress(watched: number, duration: number, completed: boolean): number {
  if (completed) return 100;
  if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min((watched / duration) * 100, 100));
}

async function ensureContent(
  ctx: MutationCtx,
  item: ImportedMedia
): Promise<{ contentId: Id<"content">; created: boolean }> {
  const existing = await ctx.db
    .query("content")
    .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", item.tmdbId))
    .first();

  const fallbackPoster =
    item.posterUrl || "https://via.placeholder.com/500x750?text=Imported+Poster";
  const fallbackBackdrop =
    item.posterUrl || "https://via.placeholder.com/1920x1080?text=Imported+Backdrop";

  if (existing) {
    const updates: Partial<typeof existing> = {};

    if (!existing.posterUrl && item.posterUrl) {
      updates.posterUrl = item.posterUrl;
    }

    if (!existing.backdropUrl) {
      updates.backdropUrl = fallbackBackdrop;
    }

    if ((!existing.title || existing.title.startsWith("Imported ")) && item.title) {
      updates.title = item.title;
    }

    if ((!existing.year || existing.year === 2024) && item.year) {
      updates.year = item.year;
    }

    if (existing.type !== item.type) {
      updates.type = item.type;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(existing._id, {
        ...updates,
        updatedAt: Date.now()
      });
    }

    return { contentId: existing._id, created: false };
  }

  const contentId = await ctx.db.insert("content", {
    title: item.title || `Imported ${item.type === "movie" ? "Movie" : "Show"}`,
    description: "Imported from a p-stream export. Run a TMDB sync to enrich this title.",
    type: item.type,
    genre: [],
    year: item.year || 2024,
    rating: "NR",
    duration: undefined,
    seasons: undefined,
    posterUrl: fallbackPoster,
    backdropUrl: fallbackBackdrop,
    vidkingUrl: undefined,
    imdbId: undefined,
    tmdbId: item.tmdbId,
    trending: false,
    popular: false,
    featured: false,
    new: false,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });

  return { contentId, created: true };
}

export const importPStreamExport = mutation({
  args: {
    clerkUserId: v.string(),
    bookmarks: v.array(importedMediaValidator),
    progress: v.array(importedPlaybackValidator),
    history: v.array(importedPlaybackValidator)
  },
  handler: async (ctx, { clerkUserId, bookmarks, progress, history }) => {
    const userId = await getOrCreateUserId(ctx, clerkUserId);
    const contentCache = new Map<string, Id<"content">>();
    let createdContent = 0;
    let importedWatchlist = 0;
    let importedHistory = 0;

    const getContentId = async (item: ImportedMedia) => {
      const cached = contentCache.get(item.tmdbId);
      if (cached) return cached;

      const ensured = await ensureContent(ctx, item);
      if (ensured.created) {
        createdContent += 1;
      }
      contentCache.set(item.tmdbId, ensured.contentId);
      return ensured.contentId;
    };

    for (const bookmark of bookmarks) {
      const contentId = await getContentId(bookmark);
      const existingWatchlist = await ctx.db
        .query("watchlist")
        .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
        .first();

      if (!existingWatchlist) {
        await ctx.db.insert("watchlist", {
          userId,
          contentId,
          addedAt: Date.now()
        });
        importedWatchlist += 1;
      }
    }

    const latestPlayback = new Map<string, ImportedPlayback>();
    for (const item of [...progress, ...history]) {
      const existing = latestPlayback.get(item.tmdbId);
      if (!existing || item.timestamp > existing.timestamp) {
        latestPlayback.set(item.tmdbId, item);
      }
    }

    for (const item of latestPlayback.values()) {
      const contentId = await getContentId(item);
      const progressPercent = normalizeProgress(item.watched, item.duration, item.completed);
      const existingHistory = await ctx.db
        .query("watchHistory")
        .withIndex("by_user_content", (q) => q.eq("userId", userId).eq("contentId", contentId))
        .first();

      if (existingHistory) {
        await ctx.db.patch(existingHistory._id, {
          progress: progressPercent,
          positionSeconds: Math.max(0, item.watched),
          durationSeconds: Math.max(0, item.duration),
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          completed: item.completed || progressPercent >= 95,
          watchedAt: item.timestamp
        });
      } else {
        await ctx.db.insert("watchHistory", {
          userId,
          contentId,
          progress: progressPercent,
          positionSeconds: Math.max(0, item.watched),
          durationSeconds: Math.max(0, item.duration),
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          completed: item.completed || progressPercent >= 95,
          watchedAt: item.timestamp
        });
      }

      importedHistory += 1;
    }

    return {
      createdContent,
      importedWatchlist,
      importedHistory
    };
  }
});
