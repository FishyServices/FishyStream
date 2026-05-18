import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { toSeasonMetaSummary, type SeasonMetaSummary } from "../shared/contentMetadata";

const episodeValidator = v.object({
  episodeNumber: v.number(),
  name: v.string(),
  overview: v.optional(v.string()),
  stillUrl: v.optional(v.string()),
  airDate: v.optional(v.string()),
  runtime: v.optional(v.number()),
  voteAverage: v.number()
});

async function readSeasonRows(ctx: QueryCtx | MutationCtx, contentId: Id<"content">) {
  return await ctx.db
    .query("seasons")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .collect();
}

function sortSeasons(rows: Doc<"seasons">[]) {
  return [...rows].sort((a, b) => a.seasonNumber - b.seasonNumber);
}

async function syncContentSeasonAggregates(ctx: MutationCtx, contentId: Id<"content">) {
  const content = await ctx.db.get(contentId);
  if (!content) return;

  const seasons = sortSeasons(await readSeasonRows(ctx, contentId));
  const totalSeasons = seasons.length > 0 ? Math.max(...seasons.map((row) => row.seasonNumber)) : 0;
  const totalEpisodes = seasons.reduce(
    (sum, season) => sum + (season.episodeCount || season.episodes.length),
    0
  );

  await ctx.db.patch(contentId, {
    seasons: totalSeasons,
    totalEpisodes,
    updatedAt: Date.now()
  });
}

export const upsertSeason = internalMutation({
  args: {
    contentId: v.id("content"),
    tmdbId: v.string(),
    anilistId: v.optional(v.string()),
    seasonNumber: v.number(),
    name: v.string(),
    overview: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    airDate: v.optional(v.string()),
    episodeCount: v.number(),
    episodes: v.array(episodeValidator)
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
    } else {
      await ctx.db.insert("seasons", { ...args, createdAt: now, updatedAt: now });
    }

    await syncContentSeasonAggregates(ctx, args.contentId);
  }
});

export const listSeasonSummariesByContent = query({
  args: { contentId: v.id("content") },
  handler: async (ctx, { contentId }): Promise<SeasonMetaSummary[]> => {
    const rows = sortSeasons(await readSeasonRows(ctx, contentId));
    return rows.map(toSeasonMetaSummary);
  }
});

export const getSeasonEpisodeList = query({
  args: { contentId: v.id("content"), seasonNumber: v.number() },
  handler: async (ctx, { contentId, seasonNumber }): Promise<Doc<"seasons"> | null> => {
    return await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();
  }
});

export const getSeasonPlaybackMeta = query({
  args: { contentId: v.id("content"), seasonNumber: v.number() },
  handler: async (ctx, { contentId, seasonNumber }) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();

    if (!season) return null;

    return {
      contentId: season.contentId,
      seasonNumber: season.seasonNumber,
      name: season.name,
      airDate: season.airDate,
      episodeCount: season.episodeCount,
      anilistId: season.anilistId
    };
  }
});

export const rebuildContentSeasonAggregates = internalMutation({
  args: {
    contentId: v.optional(v.id("content")),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { contentId, limit = 500 }) => {
    if (contentId) {
      await syncContentSeasonAggregates(ctx, contentId);
      return 1;
    }

    const rows = await ctx.db.query("content").take(limit);
    let updated = 0;
    for (const row of rows) {
      await syncContentSeasonAggregates(ctx, row._id);
      updated += 1;
    }
    return updated;
  }
});
