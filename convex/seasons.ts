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

async function readSeasonSummaryRows(ctx: QueryCtx | MutationCtx, contentId: Id<"content">) {
  return await ctx.db
    .query("seasonSummaries")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .collect();
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
    stillUrl: episode.stillUrl,
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

function packAniListEpisodeMappings(mappings: AniListEpisodeMapping[] | undefined) {
  return mappings
    ?.map(
      (mapping) =>
        `${mapping.episodeNumber}:${mapping.anilistId}:${mapping.anilistEpisodeNumber}`
    )
    .join("|");
}

function findPackedAniListEpisodeMapping(pack: string | undefined, episodeNumber?: number) {
  if (!pack || episodeNumber == null) return undefined;
  const prefix = `${episodeNumber}:`;
  const entry = pack.split("|").find((item) => item.startsWith(prefix));
  if (!entry) return undefined;

  const [, anilistId, anilistEpisodeNumber] = entry.split(":");
  const parsedEpisodeNumber = Number(anilistEpisodeNumber);
  if (!anilistId || !Number.isFinite(parsedEpisodeNumber)) return undefined;

  return {
    episodeNumber,
    anilistId,
    anilistEpisodeNumber: parsedEpisodeNumber
  };
}

function seasonPayloadHash(args: {
  contentId: Id<"content">;
  tmdbId: string;
  anilistId?: string;
  anilistEpisodeMappingPack?: string;
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
      anilistEpisodeMappingPack: args.anilistEpisodeMappingPack,
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
      left.stillUrl !== right.stillUrl ||
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

async function bumpContentSeasonAggregates(
  ctx: MutationCtx,
  args: {
    contentId: Id<"content">;
    seasonNumber: number;
    previousEpisodeCount: number;
    nextEpisodeCount: number;
  }
) {
  const episodeDelta = Math.max(0, args.nextEpisodeCount - args.previousEpisodeCount);
  if (episodeDelta === 0 && args.previousEpisodeCount > 0) return;

  const content = await ctx.db.get(args.contentId);
  if (!content) return;

  const nextSeasons = Math.max(content.seasons ?? 0, args.seasonNumber);
  const currentTotalEpisodes = content.totalEpisodes ?? 0;
  const nextTotalEpisodes =
    args.previousEpisodeCount > 0
      ? Math.max(currentTotalEpisodes, currentTotalEpisodes + episodeDelta)
      : Math.max(currentTotalEpisodes, args.nextEpisodeCount);

  if (content.seasons === nextSeasons && content.totalEpisodes === nextTotalEpisodes) return;

  await ctx.db.patch(args.contentId, {
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
    const anilistEpisodeMappingPack = packAniListEpisodeMappings(args.anilistEpisodeMappings);
    const compactedArgs = {
      ...args,
      anilistEpisodeMappings: undefined,
      overview: truncate(args.overview, 180),
      posterUrl: undefined,
      episodes: compactEpisodes(args.episodes)
    };
    const payloadHash = seasonPayloadHash({ ...compactedArgs, anilistEpisodeMappingPack });
    const existingSummary = await ctx.db
      .query("seasonSummaries")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();

    if (existingSummary?.payloadHash === payloadHash) {
      return;
    }

    const now = Date.now();
    let seasonId = existingSummary?.seasonId;
    let existing: Doc<"seasons"> | null = null;

    if (!seasonId) {
      existing = await ctx.db
        .query("seasons")
        .withIndex("by_content_season", (q) =>
          q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
        )
        .first();
      seasonId = existing?._id;
    }

    if (seasonId && existing) {
      if (!seasonPayloadChanged(existing, compactedArgs)) {
        if (existingSummary) {
          await ctx.db.patch(existingSummary._id, { seasonId, payloadHash, updatedAt: now });
        } else {
          await ctx.db.insert("seasonSummaries", {
            seasonId,
            contentId: args.contentId,
            tmdbId: args.tmdbId,
            seasonNumber: args.seasonNumber,
            name: truncate(args.name, 80) || `Season ${args.seasonNumber}`,
            airDate: args.airDate,
            episodeCount: args.episodeCount,
            storedEpisodeCount: compactedArgs.episodes.length,
            anilistId: args.anilistId,
            anilistEpisodeMappingPack,
            anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
            payloadHash,
            updatedAt: now
          });
        }
        return;
      }
      await ctx.db.patch(seasonId, { ...compactedArgs, updatedAt: now });
    } else if (seasonId) {
      await ctx.db.patch(seasonId, { ...compactedArgs, updatedAt: now });
    } else {
      seasonId = await ctx.db.insert("seasons", { ...compactedArgs, createdAt: now, updatedAt: now });
    }

    const summary = {
      seasonId,
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      seasonNumber: args.seasonNumber,
      name: truncate(args.name, 80) || `Season ${args.seasonNumber}`,
      airDate: args.airDate,
      episodeCount: args.episodeCount,
      storedEpisodeCount: compactedArgs.episodes.length,
      anilistId: args.anilistId,
      anilistEpisodeMappingPack,
      anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
      payloadHash,
      updatedAt: now
    };

    if (existingSummary) {
      await ctx.db.patch(existingSummary._id, summary);
    } else {
      await ctx.db.insert("seasonSummaries", summary);
    }

    await bumpContentSeasonAggregates(ctx, {
      contentId: args.contentId,
      seasonNumber: args.seasonNumber,
      previousEpisodeCount: existingSummary?.episodeCount ?? 0,
      nextEpisodeCount: args.episodeCount
    });
  }
});

export const getSeasonModalView = query({
  args: { contentId: v.id("content"), seasonNumber: v.number() },
  handler: async (
    ctx,
    { contentId, seasonNumber }
  ): Promise<{
    summaries: SeasonMetaSummary[];
    selectedSeason: {
      overview?: string;
      episodes: Array<{
        episodeNumber: number;
        name: string;
        overview?: string;
        stillUrl?: string;
        runtime?: number;
      }>;
    } | null;
  }> => {
    const rows = sortSeasonSummaries(await readSeasonSummaryRows(ctx, contentId));
    const summaries = rows.map(toSeasonMetaSummary);
    const season = await ctx.db
      .query("seasons")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();

    if (!season) {
      return { summaries, selectedSeason: null };
    }

    return {
      summaries,
      selectedSeason: {
        overview: season.overview,
        episodes: season.episodes.map((episode) => ({
          episodeNumber: episode.episodeNumber,
          name: episode.name,
          overview: episode.overview ? episode.overview.slice(0, 120) : undefined,
          stillUrl: episode.stillUrl,
          runtime: episode.runtime
        }))
      }
    };
  }
});

export const getSeasonPlaybackMeta = query({
  args: {
    contentId: v.id("content"),
    seasonNumber: v.number(),
    episodeNumber: v.optional(v.number()),
    includeAnimeMappings: v.optional(v.boolean())
  },
  handler: async (ctx, { contentId, seasonNumber, episodeNumber, includeAnimeMappings }) => {
    const summary = await ctx.db
      .query("seasonSummaries")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();

    if (summary) {
      const episodeMapping = findPackedAniListEpisodeMapping(
        summary.anilistEpisodeMappingPack,
        episodeNumber
      );
      return {
        seasonNumber: summary.seasonNumber,
        name: summary.name,
        airDate: summary.airDate,
        episodeCount: summary.episodeCount,
        anilistId: includeAnimeMappings ? summary.anilistId : undefined,
        anilistEpisodeMappingCount: includeAnimeMappings
          ? summary.anilistEpisodeMappingCount
          : undefined,
        anilistEpisodeMappings:
          includeAnimeMappings && episodeMapping ? [episodeMapping] : undefined
      };
    }
    return null;
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
