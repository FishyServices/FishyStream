import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toSeasonMetaSummary,
  type AniListEpisodeMapping,
  type SeasonMetaSummary
} from "../shared/contentMetadata";

const episodeValidator = v.object({
  episodeNumber: v.number(),
  name: v.string(),
  overview: v.optional(v.string()),
  stillUrl: v.optional(v.string()),
  airDate: v.optional(v.string()),
  runtime: v.optional(v.number()),
  voteAverage: v.number()
});

const anilistEpisodeMappingValidator = v.object({
  episodeNumber: v.number(),
  anilistId: v.string(),
  anilistEpisodeNumber: v.number()
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

function episodesEqual(a: Doc<"seasons">["episodes"], b: typeof a) {
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right) {
      return false;
    }
    if (
      left.episodeNumber !== right.episodeNumber ||
      left.name !== right.name ||
      left.overview !== right.overview ||
      left.stillUrl !== right.stillUrl ||
      left.airDate !== right.airDate ||
      left.runtime !== right.runtime ||
      left.voteAverage !== right.voteAverage
    ) {
      return false;
    }
  }

  return true;
}

function seasonPayloadChanged(
  existing: Doc<"seasons">,
  args: {
    contentId: Id<"content">;
    tmdbId: string;
    anilistId?: string;
    anilistEpisodeMappings?: AniListEpisodeMapping[];
    seasonNumber: number;
    name: string;
    overview?: string;
    posterUrl?: string;
    airDate?: string;
    episodeCount: number;
    episodes: Doc<"seasons">["episodes"];
  }
) {
  return (
    existing.contentId !== args.contentId ||
    existing.tmdbId !== args.tmdbId ||
    existing.anilistId !== args.anilistId ||
    JSON.stringify(existing.anilistEpisodeMappings ?? []) !==
      JSON.stringify(args.anilistEpisodeMappings ?? []) ||
    existing.seasonNumber !== args.seasonNumber ||
    existing.name !== args.name ||
    existing.overview !== args.overview ||
    existing.posterUrl !== args.posterUrl ||
    existing.airDate !== args.airDate ||
    existing.episodeCount !== args.episodeCount ||
    !episodesEqual(existing.episodes, args.episodes)
  );
}

async function syncContentSeasonAggregates(ctx: MutationCtx, contentId: Id<"content">) {
  const content = await ctx.db.get(contentId);
  if (!content) return;

  const seasons = sortSeasons(await readSeasonRows(ctx, contentId));
  const syncedSeasonCount =
    seasons.length > 0 ? Math.max(...seasons.map((row) => row.seasonNumber)) : 0;
  const syncedEpisodeCount = seasons.reduce(
    (sum, season) => sum + (season.episodeCount || season.episodes.length),
    0
  );

  await ctx.db.patch(contentId, {
    seasons: Math.max(content.seasons ?? 0, syncedSeasonCount),
    totalEpisodes: Math.max(content.totalEpisodes ?? 0, syncedEpisodeCount),
    updatedAt: Date.now()
  });
}

export const upsertSeason = internalMutation({
  args: {
    contentId: v.id("content"),
    tmdbId: v.string(),
    anilistId: v.optional(v.string()),
    anilistEpisodeMappings: v.optional(v.array(anilistEpisodeMappingValidator)),
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
      if (!seasonPayloadChanged(existing, args)) {
        return;
      }
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

export const getSeasonEpisodeView = query({
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
      overview: season.overview,
      episodes: season.episodes.map((episode) => ({
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        overview: episode.overview ? episode.overview.slice(0, 120) : undefined,
        stillUrl: episode.stillUrl,
        runtime: episode.runtime
      }))
    };
  }
});

export const getSeasonPlaybackMeta = query({
  args: {
    contentId: v.id("content"),
    seasonNumber: v.number(),
    includeAnimeMappings: v.optional(v.boolean())
  },
  handler: async (ctx, { contentId, seasonNumber, includeAnimeMappings }) => {
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();

    if (!season) return null;

    return {
      seasonNumber: season.seasonNumber,
      name: season.name,
      airDate: season.airDate,
      episodeCount: season.episodeCount,
      anilistId: includeAnimeMappings ? season.anilistId : undefined,
      anilistEpisodeMappings: includeAnimeMappings ? season.anilistEpisodeMappings : undefined
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
