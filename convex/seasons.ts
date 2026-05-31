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

async function readSeasonSummaryRows(ctx: QueryCtx | MutationCtx, contentId: Id<"content">) {
  return await ctx.db
    .query("seasonSummaries")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .collect();
}

function sortSeasons(rows: Doc<"seasons">[]) {
  return [...rows].sort((a, b) => a.seasonNumber - b.seasonNumber);
}

function sortSeasonSummaries(rows: Doc<"seasonSummaries">[]) {
  return [...rows].sort((a, b) => a.seasonNumber - b.seasonNumber);
}

function truncate(value: string | undefined, max: number) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

function compactEpisodes(episodes: Doc<"seasons">["episodes"]) {
  return episodes.map((episode) => ({
    episodeNumber: episode.episodeNumber,
    name: truncate(episode.name, 80) || `Episode ${episode.episodeNumber}`,
    runtime: episode.runtime,
    voteAverage: episode.voteAverage ?? 0
  }));
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function seasonPayloadHash(args: {
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
}) {
  return hashString(
    JSON.stringify({
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      anilistId: args.anilistId,
      anilistEpisodeMappings: args.anilistEpisodeMappings,
      seasonNumber: args.seasonNumber,
      name: args.name,
      overview: args.overview,
      posterUrl: args.posterUrl,
      airDate: args.airDate,
      episodeCount: args.episodeCount,
      episodes: args.episodes
    })
  );
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
    existing.overview !== truncate(args.overview, 180) ||
    existing.airDate !== args.airDate ||
    existing.episodeCount !== args.episodeCount ||
    !episodesEqual(existing.episodes, compactEpisodes(args.episodes))
  );
}

async function syncContentSeasonAggregates(ctx: MutationCtx, contentId: Id<"content">) {
  const content = await ctx.db.get(contentId);
  if (!content) return;

  const seasons = sortSeasonSummaries(await readSeasonSummaryRows(ctx, contentId));
  const syncedSeasonCount =
    seasons.length > 0 ? Math.max(...seasons.map((row) => row.seasonNumber)) : 0;
  const syncedEpisodeCount = seasons.reduce(
    (sum, season) => sum + (season.episodeCount || season.storedEpisodeCount),
    0
  );

  const nextSeasons = Math.max(content.seasons ?? 0, syncedSeasonCount);
  const nextTotalEpisodes = Math.max(content.totalEpisodes ?? 0, syncedEpisodeCount);
  if (content.seasons === nextSeasons && content.totalEpisodes === nextTotalEpisodes) return;

  await ctx.db.patch(contentId, {
    seasons: nextSeasons,
    totalEpisodes: nextTotalEpisodes,
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
    const compactedArgs = {
      ...args,
      overview: truncate(args.overview, 180),
      posterUrl: undefined,
      episodes: compactEpisodes(args.episodes)
    };
    const payloadHash = seasonPayloadHash(compactedArgs);
    const existingSummary = await ctx.db
      .query("seasonSummaries")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();

    if (existingSummary?.payloadHash === payloadHash) {
      return;
    }

    const existing = await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();

    const now = Date.now();
    if (existing) {
      if (!seasonPayloadChanged(existing, compactedArgs)) {
        if (existingSummary) {
          await ctx.db.patch(existingSummary._id, { payloadHash, updatedAt: now });
        } else {
          await ctx.db.insert("seasonSummaries", {
            contentId: args.contentId,
            tmdbId: args.tmdbId,
            seasonNumber: args.seasonNumber,
            name: truncate(args.name, 80) || `Season ${args.seasonNumber}`,
            airDate: args.airDate,
            episodeCount: args.episodeCount,
            storedEpisodeCount: compactedArgs.episodes.length,
            anilistId: args.anilistId,
            anilistEpisodeMappings: args.anilistEpisodeMappings,
            payloadHash,
            updatedAt: now
          });
        }
        return;
      }
      await ctx.db.patch(existing._id, { ...compactedArgs, updatedAt: now });
    } else {
      await ctx.db.insert("seasons", { ...compactedArgs, createdAt: now, updatedAt: now });
    }

    const summary = {
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      seasonNumber: args.seasonNumber,
      name: truncate(args.name, 80) || `Season ${args.seasonNumber}`,
      airDate: args.airDate,
      episodeCount: args.episodeCount,
      storedEpisodeCount: compactedArgs.episodes.length,
      anilistId: args.anilistId,
      anilistEpisodeMappings: args.anilistEpisodeMappings,
      payloadHash,
      updatedAt: now
    };

    if (existingSummary) {
      await ctx.db.patch(existingSummary._id, summary);
    } else {
      await ctx.db.insert("seasonSummaries", summary);
    }

    await syncContentSeasonAggregates(ctx, args.contentId);
  }
});

export const listSeasonSummariesByContent = query({
  args: { contentId: v.id("content") },
  handler: async (ctx, { contentId }): Promise<SeasonMetaSummary[]> => {
    const rows = sortSeasonSummaries(await readSeasonSummaryRows(ctx, contentId));
    if (rows.length > 0) {
      return rows.map(toSeasonMetaSummary);
    }

    return sortSeasons(await readSeasonRows(ctx, contentId)).map((row) =>
      toSeasonMetaSummary({
        contentId: row.contentId,
        seasonNumber: row.seasonNumber,
        name: row.name,
        airDate: row.airDate,
        episodeCount: row.episodeCount,
        anilistId: row.anilistId,
        storedEpisodeCount: row.episodes.length
      })
    );
  }
});

export const getSeasonEpisodeList = query({
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
      seasonNumber: season.seasonNumber,
      name: season.name,
      episodeCount: season.episodeCount,
      episodes: season.episodes.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        name: ep.name,
        overview: ep.overview ? ep.overview.slice(0, 120) : undefined,
        stillUrl: ep.stillUrl,
        runtime: ep.runtime
      }))
    };
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
    const summary = await ctx.db
      .query("seasonSummaries")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();

    if (summary) {
      return {
        seasonNumber: summary.seasonNumber,
        name: summary.name,
        airDate: summary.airDate,
        episodeCount: summary.episodeCount,
        anilistId: includeAnimeMappings ? summary.anilistId : undefined,
        anilistEpisodeMappings: includeAnimeMappings ? summary.anilistEpisodeMappings : undefined
      };
    }

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

export const rebuildSeasonSummaries = internalMutation({
  args: {
    contentId: v.optional(v.id("content")),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { contentId, limit = 1000 }) => {
    const rows = contentId
      ? await readSeasonRows(ctx, contentId)
      : await ctx.db.query("seasons").take(limit);

    const touchedContentIds = new Set<Id<"content">>();
    let updated = 0;

    for (const row of rows) {
      const compacted = {
        contentId: row.contentId,
        tmdbId: row.tmdbId,
        anilistId: row.anilistId,
        anilistEpisodeMappings: row.anilistEpisodeMappings,
        seasonNumber: row.seasonNumber,
        name: truncate(row.name, 80) || `Season ${row.seasonNumber}`,
        overview: truncate(row.overview, 180),
        posterUrl: undefined,
        airDate: row.airDate,
        episodeCount: row.episodeCount,
        episodes: compactEpisodes(row.episodes)
      };
      const payloadHash = seasonPayloadHash(compacted);
      const hasLegacyEpisodePayload = row.episodes.some(
        (episode) => episode.overview || episode.stillUrl || episode.airDate
      );
      if (row.posterUrl || hasLegacyEpisodePayload || seasonPayloadChanged(row, compacted)) {
        await ctx.db.patch(row._id, { ...compacted, updatedAt: Date.now() });
      }

      const summary = {
        contentId: row.contentId,
        tmdbId: row.tmdbId,
        seasonNumber: row.seasonNumber,
        name: compacted.name,
        airDate: row.airDate,
        episodeCount: row.episodeCount,
        storedEpisodeCount: compacted.episodes.length,
        anilistId: row.anilistId,
        anilistEpisodeMappings: row.anilistEpisodeMappings,
        payloadHash,
        updatedAt: Date.now()
      };
      const existingSummary = await ctx.db
        .query("seasonSummaries")
        .withIndex("by_content_season", (q) =>
          q.eq("contentId", row.contentId).eq("seasonNumber", row.seasonNumber)
        )
        .first();

      if (existingSummary) {
        await ctx.db.patch(existingSummary._id, summary);
      } else {
        await ctx.db.insert("seasonSummaries", summary);
      }

      touchedContentIds.add(row.contentId);
      updated += 1;
    }

    for (const id of touchedContentIds) {
      await syncContentSeasonAggregates(ctx, id);
    }

    return updated;
  }
});
