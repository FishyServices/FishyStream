import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { AniListEpisodeMapping, SeasonMetaSummary } from "../shared/contentMetadata";

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

type SeasonSummaryWire = [
  seasonNumber: number,
  episodeCount: number,
  storedEpisodeCount: number,
  anilistId?: string | null,
  anilistEpisodeMappingCount?: number | null,
  name?: string | null,
  airDate?: string | null
];

type EpisodeWire = [
  episodeNumber: number,
  name: string,
  overview?: string | null,
  stillUrl?: string | null,
  runtime?: number | null
];

function truncate(value: string | undefined, max: number) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
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
      (mapping) => `${mapping.episodeNumber}:${mapping.anilistId}:${mapping.anilistEpisodeNumber}`
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

function toEpisodeWire(episode: {
  episodeNumber: number;
  name: string;
  overview?: string;
  stillUrl?: string;
  runtime?: number;
}): EpisodeWire {
  return [
    episode.episodeNumber,
    truncate(episode.name, 80) || `Episode ${episode.episodeNumber}`,
    truncate(episode.overview, 120) ?? null,
    episode.stillUrl ?? null,
    episode.runtime ?? null
  ];
}

function toSeasonSummaryWire(args: {
  seasonNumber: number;
  episodeCount: number;
  storedEpisodeCount: number;
  anilistId?: string;
  anilistEpisodeMappingCount?: number;
  name: string;
  airDate?: string;
}): SeasonSummaryWire {
  return [
    args.seasonNumber,
    args.episodeCount,
    args.storedEpisodeCount,
    args.anilistId ?? null,
    args.anilistEpisodeMappingCount ?? null,
    truncate(args.name, 80) || `Season ${args.seasonNumber}`,
    args.airDate ?? null
  ];
}

function fromSeasonSummaryWire(row: SeasonSummaryWire): SeasonMetaSummary {
  return {
    seasonNumber: row[0],
    episodeCount: row[1],
    storedEpisodeCount: row[2],
    anilistId: row[3] ?? undefined,
    anilistEpisodeMappingCount: row[4] ?? undefined
  };
}

function episodePayloadHash(value: unknown) {
  return hashString(JSON.stringify(value));
}

async function upsertSeasonIndex(
  ctx: MutationCtx,
  args: {
    contentId: Id<"content">;
    tmdbId: string;
    summary: SeasonSummaryWire;
    now: number;
  }
) {
  const existing = await ctx.db
    .query("seasonIndex")
    .withIndex("by_content", (q) => q.eq("contentId", args.contentId))
    .first();

  const summaries = (existing?.summaries ?? []) as SeasonSummaryWire[];
  const nextSummaries = summaries.filter((row) => row[0] !== args.summary[0]);
  nextSummaries.push(args.summary);
  nextSummaries.sort((a, b) => a[0] - b[0]);
  const payloadHash = episodePayloadHash(nextSummaries);

  if (existing) {
    if (existing.payloadHash !== payloadHash) {
      await ctx.db.patch(existing._id, {
        tmdbId: args.tmdbId,
        summaries: nextSummaries,
        updatedAt: args.now,
        payloadHash
      });
    }
    return;
  }

  await ctx.db.insert("seasonIndex", {
    contentId: args.contentId,
    tmdbId: args.tmdbId,
    summaries: nextSummaries,
    updatedAt: args.now,
    payloadHash
  });
}

async function syncContentSeasonAggregates(ctx: MutationCtx, contentId: Id<"content">) {
  const seasonIndex = await ctx.db
    .query("seasonIndex")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .first();
  if (!seasonIndex) return;

  const summaries = seasonIndex.summaries as SeasonSummaryWire[];
  const nextSeasons = summaries.length > 0 ? Math.max(...summaries.map((row) => row[0])) : 0;
  const nextTotalEpisodes = summaries.reduce((sum, row) => sum + (row[1] || row[2]), 0);

  const detail = await ctx.db
    .query("contentDetails")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .first();
  if (detail) {
    const seasons = Math.max(detail.seasons ?? 0, nextSeasons);
    const totalEpisodes = Math.max(detail.totalEpisodes ?? 0, nextTotalEpisodes);
    if (detail.seasons !== seasons || detail.totalEpisodes !== totalEpisodes) {
      await ctx.db.patch(detail._id, { seasons, totalEpisodes, updatedAt: Date.now() });
    }
  }
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
    const now = Date.now();
    const anilistEpisodeMappingPack = packAniListEpisodeMappings(args.anilistEpisodeMappings);
    const episodes = args.episodes.map(toEpisodeWire);
    const payloadHash = episodePayloadHash({
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      seasonNumber: args.seasonNumber,
      overview: truncate(args.overview, 180),
      anilistId: args.anilistId,
      anilistEpisodeMappingPack,
      episodes
    });

    const existingEpisodes = await ctx.db
      .query("seasonEpisodes")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();

    if (!existingEpisodes || existingEpisodes.payloadHash !== payloadHash) {
      const payload = {
        contentId: args.contentId,
        tmdbId: args.tmdbId,
        seasonNumber: args.seasonNumber,
        overview: truncate(args.overview, 180),
        anilistId: args.anilistId,
        anilistEpisodeMappingPack,
        anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
        episodes,
        updatedAt: now,
        payloadHash
      };

      if (existingEpisodes) {
        await ctx.db.patch(existingEpisodes._id, payload);
      } else {
        await ctx.db.insert("seasonEpisodes", payload);
      }
    }

    await upsertSeasonIndex(ctx, {
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      summary: toSeasonSummaryWire({
        seasonNumber: args.seasonNumber,
        episodeCount: args.episodeCount,
        storedEpisodeCount: episodes.length,
        anilistId: args.anilistId,
        anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
        name: args.name,
        airDate: args.airDate
      }),
      now
    });

    await syncContentSeasonAggregates(ctx, args.contentId);
  }
});

async function readSeasonIndex(ctx: QueryCtx, contentId: Id<"content">) {
  return await ctx.db
    .query("seasonIndex")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .first();
}

async function readSeasonEpisodes(ctx: QueryCtx, contentId: Id<"content">, seasonNumber: number) {
  return await ctx.db
    .query("seasonEpisodes")
    .withIndex("by_content_season", (q) =>
      q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
    )
    .first();
}

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
    const [seasonIndex, season] = await Promise.all([
      readSeasonIndex(ctx, contentId),
      readSeasonEpisodes(ctx, contentId, seasonNumber)
    ]);

    const summaries = ((seasonIndex?.summaries ?? []) as SeasonSummaryWire[]).map(
      fromSeasonSummaryWire
    );

    if (!season) {
      return { summaries, selectedSeason: null };
    }

    return {
      summaries,
      selectedSeason: {
        overview: season.overview,
        episodes: (season.episodes as EpisodeWire[]).map((episode) => ({
          episodeNumber: episode[0],
          name: episode[1],
          overview: episode[2] ?? undefined,
          stillUrl: episode[3] ?? undefined,
          runtime: episode[4] ?? undefined
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
    const index = await readSeasonIndex(ctx, contentId);
    const summary = ((index?.summaries ?? []) as SeasonSummaryWire[]).find(
      (row) => row[0] === seasonNumber
    );

    if (!includeAnimeMappings && summary) {
      return {
        seasonNumber,
        name: summary[5] ?? `Season ${seasonNumber}`,
        airDate: summary[6] ?? undefined,
        episodeCount: summary[1]
      };
    }

    const season = await readSeasonEpisodes(ctx, contentId, seasonNumber);
    if (!season) return null;

    const episodeMapping = findPackedAniListEpisodeMapping(
      season.anilistEpisodeMappingPack,
      episodeNumber
    );

    return {
      seasonNumber,
      name: summary?.[5] ?? `Season ${seasonNumber}`,
      airDate: summary?.[6] ?? undefined,
      episodeCount: summary?.[1] ?? (season.episodes as EpisodeWire[]).length,
      anilistId: includeAnimeMappings ? season.anilistId : undefined,
      anilistEpisodeMappingCount: includeAnimeMappings
        ? season.anilistEpisodeMappingCount
        : undefined,
      anilistEpisodeMappings: includeAnimeMappings && episodeMapping ? [episodeMapping] : undefined
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

    const rows = await ctx.db.query("seasonIndex").take(limit);
    let updated = 0;
    for (const row of rows) {
      await syncContentSeasonAggregates(ctx, row.contentId);
      updated += 1;
    }
    return updated;
  }
});
