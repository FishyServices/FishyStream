import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { AniListEpisodeMapping, SeasonMetaSummary } from "../shared/contentMetadata";
import { toImageWire } from "../shared/contentMetadata";

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
    episode.stillUrl ? toImageWire(episode.stillUrl) : null,
    episode.runtime ?? null
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

async function readEpisodeMapping(
  ctx: QueryCtx,
  contentId: Id<"content">,
  seasonNumber: number,
  episodeNumber?: number
) {
  if (episodeNumber == null) return null;
  return await ctx.db
    .query("seasonEpisodeMappings")
    .withIndex("by_content_season_episode", (q) =>
      q.eq("contentId", contentId).eq("seasonNumber", seasonNumber).eq("episodeNumber", episodeNumber)
    )
    .first();
}

async function replaceSeasonEpisodeMappings(
  ctx: MutationCtx,
  args: {
    contentId: Id<"content">;
    seasonNumber: number;
    mappings?: AniListEpisodeMapping[];
    now: number;
  }
) {
  const existingMappings = await ctx.db
    .query("seasonEpisodeMappings")
    .withIndex("by_content_season", (q) =>
      q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
    )
    .collect();
  for (const row of existingMappings) {
    await ctx.db.delete(row._id);
  }

  for (const mapping of args.mappings ?? []) {
    await ctx.db.insert("seasonEpisodeMappings", {
      contentId: args.contentId,
      seasonNumber: args.seasonNumber,
      episodeNumber: mapping.episodeNumber,
      anilistId: mapping.anilistId,
      anilistEpisodeNumber: mapping.anilistEpisodeNumber,
      updatedAt: args.now
    });
  }
}

function fromSeasonPlaybackMeta(row: {
  seasonNumber: number;
  episodeCount: number;
  storedEpisodeCount: number;
  anilistId?: string;
  anilistEpisodeMappingCount?: number;
}): SeasonMetaSummary {
  return {
    seasonNumber: row.seasonNumber,
    episodeCount: row.episodeCount,
    storedEpisodeCount: row.storedEpisodeCount,
    anilistId: row.anilistId,
    anilistEpisodeMappingCount: row.anilistEpisodeMappingCount
  };
}

function episodePayloadHash(value: unknown) {
  return hashString(JSON.stringify(value));
}

function isSameSeasonPlaybackMeta(
  existing: NonNullable<Awaited<ReturnType<typeof readSeasonPlaybackMeta>>>,
  payload: {
    name: string;
    airDate?: string;
    episodeCount: number;
    storedEpisodeCount: number;
    anilistId?: string;
    anilistEpisodeMappingCount?: number;
    seasonEpisodePayloadHash: string;
  }
) {
  return (
    existing.name === payload.name &&
    existing.airDate === payload.airDate &&
    existing.episodeCount === payload.episodeCount &&
    existing.storedEpisodeCount === payload.storedEpisodeCount &&
    existing.anilistId === payload.anilistId &&
    existing.anilistEpisodeMappingCount === payload.anilistEpisodeMappingCount &&
    existing.seasonEpisodePayloadHash === payload.seasonEpisodePayloadHash
  );
}

async function upsertSeasonPlaybackMeta(
  ctx: MutationCtx,
  args: {
    contentId: Id<"content">;
    seasonNumber: number;
    name: string;
    airDate?: string;
    episodeCount: number;
    storedEpisodeCount: number;
    anilistId?: string;
    anilistEpisodeMappingCount?: number;
    seasonEpisodePayloadHash: string;
    now: number;
    existing?: Awaited<ReturnType<typeof readSeasonPlaybackMeta>>;
  }
) {
  const payload = {
    contentId: args.contentId,
    seasonNumber: args.seasonNumber,
    name: truncate(args.name, 80) || `Season ${args.seasonNumber}`,
    airDate: args.airDate,
    episodeCount: args.episodeCount,
    storedEpisodeCount: args.storedEpisodeCount,
    anilistId: args.anilistId,
    anilistEpisodeMappingCount: args.anilistEpisodeMappingCount,
    seasonEpisodePayloadHash: args.seasonEpisodePayloadHash
  };

  const existing = args.existing;

  if (existing) {
    if (!isSameSeasonPlaybackMeta(existing, payload)) {
      await ctx.db.patch(existing._id, payload);
    }
    return;
  }

  await ctx.db.insert("seasonPlaybackMeta", payload);
}

async function syncContentSeasonAggregates(ctx: MutationCtx, contentId: Id<"content">) {
  const seasonMeta = await ctx.db
    .query("seasonPlaybackMeta")
    .withIndex("by_content_season", (q) => q.eq("contentId", contentId))
    .collect();
  if (seasonMeta.length === 0) return;

  const nextSeasons = Math.max(...seasonMeta.map((row) => row.seasonNumber));
  const nextTotalEpisodes = seasonMeta.reduce(
    (sum, row) => sum + (row.episodeCount || row.storedEpisodeCount),
    0
  );

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

async function updateContentSeasonAggregatesForSeason(
  ctx: MutationCtx,
  args: {
    contentId: Id<"content">;
    seasonNumber: number;
    episodeTotal: number;
    previousEpisodeTotal?: number;
    now: number;
  }
) {
  const detail = await ctx.db
    .query("contentDetails")
    .withIndex("by_content", (q) => q.eq("contentId", args.contentId))
    .first();
  if (!detail) return;

  const seasons = Math.max(detail.seasons ?? 0, args.seasonNumber);
  let totalEpisodes = detail.totalEpisodes;
  if (totalEpisodes == null) {
    totalEpisodes = args.episodeTotal;
  } else if (args.previousEpisodeTotal != null) {
    totalEpisodes = Math.max(0, totalEpisodes + args.episodeTotal - args.previousEpisodeTotal);
  } else {
    totalEpisodes = Math.max(totalEpisodes, args.episodeTotal);
  }

  if (detail.seasons !== seasons || detail.totalEpisodes !== totalEpisodes) {
    await ctx.db.patch(detail._id, {
      seasons,
      totalEpisodes,
      updatedAt: args.now
    });
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
    const seasonEpisodePayloadHash = episodePayloadHash({
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      seasonNumber: args.seasonNumber,
      overview: truncate(args.overview, 180),
      anilistId: args.anilistId,
      anilistEpisodeMappingPack,
      episodes
    });

    const existingPlaybackMeta = await readSeasonPlaybackMeta(ctx, args.contentId, args.seasonNumber);
    const knownPayloadHash = existingPlaybackMeta?.seasonEpisodePayloadHash;
    const needsEpisodeWrite = knownPayloadHash !== seasonEpisodePayloadHash;
    const existingEpisodes = needsEpisodeWrite
      ? await ctx.db
          .query("seasonEpisodes")
          .withIndex("by_content_season", (q) =>
            q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
          )
          .first()
      : null;

    const seasonPayloadChanged =
      needsEpisodeWrite && existingEpisodes?.payloadHash !== seasonEpisodePayloadHash;
    if (seasonPayloadChanged) {
      const payload = {
        contentId: args.contentId,
        tmdbId: args.tmdbId,
        seasonNumber: args.seasonNumber,
        overview: truncate(args.overview, 180),
        anilistId: args.anilistId,
        anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
        episodes,
        updatedAt: now,
        payloadHash: seasonEpisodePayloadHash
      };

      if (existingEpisodes) {
        await ctx.db.patch(existingEpisodes._id, payload);
      } else {
        await ctx.db.insert("seasonEpisodes", payload);
      }

      await replaceSeasonEpisodeMappings(ctx, {
        contentId: args.contentId,
        seasonNumber: args.seasonNumber,
        mappings: args.anilistEpisodeMappings,
        now
      });
    }

    await upsertSeasonPlaybackMeta(ctx, {
      contentId: args.contentId,
      seasonNumber: args.seasonNumber,
      name: args.name,
      airDate: args.airDate,
      episodeCount: args.episodeCount,
      storedEpisodeCount: episodes.length,
      anilistId: args.anilistId,
      anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
      seasonEpisodePayloadHash,
      now,
      existing: existingPlaybackMeta
    });

    await updateContentSeasonAggregatesForSeason(ctx, {
      contentId: args.contentId,
      seasonNumber: args.seasonNumber,
      episodeTotal: args.episodeCount || episodes.length,
      previousEpisodeTotal: existingPlaybackMeta
        ? existingPlaybackMeta.episodeCount || existingPlaybackMeta.storedEpisodeCount
        : undefined,
      now
    });
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

async function readSeasonPlaybackMeta(
  ctx: QueryCtx,
  contentId: Id<"content">,
  seasonNumber: number
) {
  return await ctx.db
    .query("seasonPlaybackMeta")
    .withIndex("by_content_season", (q) =>
      q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
    )
    .first();
}

async function readSeasonPlaybackMetaList(ctx: QueryCtx, contentId: Id<"content">) {
  return await ctx.db
    .query("seasonPlaybackMeta")
    .withIndex("by_content_season", (q) => q.eq("contentId", contentId))
    .collect();
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
    const [playbackMeta, season] = await Promise.all([
      readSeasonPlaybackMetaList(ctx, contentId),
      readSeasonEpisodes(ctx, contentId, seasonNumber)
    ]);

    const summaries =
      playbackMeta.length > 0
        ? playbackMeta.map(fromSeasonPlaybackMeta)
        : ((await readSeasonIndex(ctx, contentId))?.summaries ?? []).map(fromSeasonSummaryWire);

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
    const episodeMappingRow = includeAnimeMappings
      ? await readEpisodeMapping(ctx, contentId, seasonNumber, episodeNumber)
      : null;

    if (includeAnimeMappings) {
      const playbackMeta = await readSeasonPlaybackMeta(ctx, contentId, seasonNumber);

      if (playbackMeta) {
        return {
          seasonNumber,
          name: playbackMeta.name,
          airDate: playbackMeta.airDate,
          episodeCount: playbackMeta.episodeCount,
          anilistId: episodeMappingRow?.anilistId,
          anilistEpisodeMappingCount: undefined,
          anilistEpisodeMappings: episodeMappingRow
            ? [
                {
                  episodeNumber: episodeMappingRow.episodeNumber,
                  anilistId: episodeMappingRow.anilistId,
                  anilistEpisodeNumber: episodeMappingRow.anilistEpisodeNumber
                }
              ]
            : undefined
        };
      }

      const index = await readSeasonIndex(ctx, contentId);
      const summary = ((index?.summaries ?? []) as SeasonSummaryWire[]).find(
        (row) => row[0] === seasonNumber
      );

      if (summary) {
        return {
          seasonNumber,
          name: summary[5] ?? `Season ${seasonNumber}`,
          airDate: summary[6] ?? undefined,
          episodeCount: summary[1],
          anilistId: episodeMappingRow?.anilistId ?? summary[3] ?? undefined,
          anilistEpisodeMappingCount: summary[4] ?? undefined,
          anilistEpisodeMappings: episodeMappingRow
            ? [
                {
                  episodeNumber: episodeMappingRow.episodeNumber,
                  anilistId: episodeMappingRow.anilistId,
                  anilistEpisodeNumber: episodeMappingRow.anilistEpisodeNumber
                }
              ]
            : undefined
        };
      }

      const season = await readSeasonEpisodes(ctx, contentId, seasonNumber);
      if (!season && !episodeMappingRow) return null;

      return {
        seasonNumber,
        name: summary?.[5] ?? `Season ${seasonNumber}`,
        airDate: summary?.[6] ?? undefined,
        episodeCount: season ? (season.episodes as EpisodeWire[]).length : undefined,
        anilistId: episodeMappingRow?.anilistId,
        anilistEpisodeMappingCount: undefined,
        anilistEpisodeMappings: episodeMappingRow
          ? [
              {
                episodeNumber: episodeMappingRow.episodeNumber,
                anilistId: episodeMappingRow.anilistId,
                anilistEpisodeNumber: episodeMappingRow.anilistEpisodeNumber
              }
            ]
          : undefined
      };
    }

    const playbackMeta = await readSeasonPlaybackMeta(ctx, contentId, seasonNumber);

    if (playbackMeta) {
      return {
        seasonNumber,
        name: playbackMeta.name,
        airDate: playbackMeta.airDate,
        episodeCount: playbackMeta.episodeCount,
        anilistId: undefined,
        anilistEpisodeMappingCount: undefined,
        anilistEpisodeMappings: undefined
      };
    }

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

    return {
      seasonNumber,
      name: summary?.[5] ?? `Season ${seasonNumber}`,
      airDate: summary?.[6] ?? undefined,
      episodeCount: summary?.[1] ?? (season.episodes as EpisodeWire[]).length,
      anilistId: undefined,
      anilistEpisodeMappingCount: undefined,
      anilistEpisodeMappings: undefined
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

    const rows = await ctx.db.query("seasonPlaybackMeta").take(limit);
    const contentIds = new Set(rows.map((row) => row.contentId));
    let updated = 0;
    for (const rowContentId of contentIds) {
      await syncContentSeasonAggregates(ctx, rowContentId);
      updated += 1;
    }
    return updated;
  }
});
