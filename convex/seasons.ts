import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const mappingValidator = v.object({
  episodeNumber: v.number(),
  anilistId: v.string(),
  anilistEpisodeNumber: v.number()
});

const episodeValidator = v.object({
  episodeNumber: v.number(),
  name: v.string(),
  overview: v.optional(v.string()),
  stillUrl: v.optional(v.string()),
  airDate: v.optional(v.string()),
  runtime: v.optional(v.number()),
  voteAverage: v.number()
});

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function hashPayload(value: unknown) {
  return hashString(JSON.stringify(value));
}

function truncate(value: string | undefined, max: number) {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max).trimEnd() : trimmed;
}

async function replaceEpisodeMappings(
  ctx: MutationCtx,
  args: {
    contentId: string;
    seasonNumber: number;
    mappings?: Array<{ episodeNumber: number; anilistId: string; anilistEpisodeNumber: number }>;
    now: number;
  }
) {
  const existing = await ctx.db
    .query("seasonEpisodeMappings")
    .withIndex("by_content_season", (q: any) =>
      q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
    )
    .collect();
  for (const row of existing) {
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

export const upsertAnimeSeasonMeta = internalMutation({
  args: {
    contentId: v.string(),
    tmdbId: v.string(),
    seasonNumber: v.number(),
    name: v.string(),
    overview: v.optional(v.string()),
    airDate: v.optional(v.string()),
    episodeCount: v.number(),
    anilistId: v.optional(v.string()),
    anilistEpisodeMappings: v.optional(v.array(mappingValidator)),
    episodes: v.array(episodeValidator)
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const storedEpisodes = args.episodes.map((episode) => [
      episode.episodeNumber,
      truncate(episode.name, 80) || `Episode ${episode.episodeNumber}`,
      truncate(episode.overview, 120) ?? null,
      episode.runtime ?? null
    ]);
    const payloadHash = hashPayload({
      contentId: args.contentId,
      tmdbId: args.tmdbId,
      seasonNumber: args.seasonNumber,
      anilistId: args.anilistId,
      mappings: args.anilistEpisodeMappings,
      episodes: storedEpisodes
    });

    const existingSeason = await ctx.db
      .query("seasonEpisodes")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();

    if (!existingSeason || existingSeason.payloadHash !== payloadHash) {
      const seasonPayload = {
        contentId: args.contentId,
        tmdbId: args.tmdbId,
        seasonNumber: args.seasonNumber,
        overview: truncate(args.overview, 180),
        anilistId: args.anilistId,
        anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
        episodes: storedEpisodes,
        updatedAt: now,
        payloadHash
      };
      if (existingSeason) {
        await ctx.db.patch(existingSeason._id, seasonPayload);
      } else {
        await ctx.db.insert("seasonEpisodes", seasonPayload);
      }
      await replaceEpisodeMappings(ctx, {
        contentId: args.contentId,
        seasonNumber: args.seasonNumber,
        mappings: args.anilistEpisodeMappings,
        now
      });
    }

    const existingMeta = await ctx.db
      .query("seasonPlaybackMeta")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", args.contentId).eq("seasonNumber", args.seasonNumber)
      )
      .first();
    const metaPayload = {
      contentId: args.contentId,
      seasonNumber: args.seasonNumber,
      name: truncate(args.name, 80) || `Season ${args.seasonNumber}`,
      airDate: args.airDate,
      episodeCount: args.episodeCount,
      storedEpisodeCount: storedEpisodes.length,
      anilistId: args.anilistId,
      anilistEpisodeMappingCount: args.anilistEpisodeMappings?.length,
      seasonEpisodePayloadHash: payloadHash
    };
    if (existingMeta) {
      await ctx.db.patch(existingMeta._id, metaPayload);
    } else {
      await ctx.db.insert("seasonPlaybackMeta", metaPayload);
    }
  }
});

export const getSeasonPlaybackMeta = query({
  args: {
    contentId: v.string(),
    seasonNumber: v.number(),
    episodeNumber: v.optional(v.number())
  },
  handler: async (ctx, { contentId, seasonNumber, episodeNumber }) => {
    const meta = await ctx.db
      .query("seasonPlaybackMeta")
      .withIndex("by_content_season", (q) =>
        q.eq("contentId", contentId).eq("seasonNumber", seasonNumber)
      )
      .first();
    if (!meta) return null;

    const mapping =
      episodeNumber == null
        ? null
        : await ctx.db
            .query("seasonEpisodeMappings")
            .withIndex("by_content_season_episode", (q) =>
              q
                .eq("contentId", contentId)
                .eq("seasonNumber", seasonNumber)
                .eq("episodeNumber", episodeNumber)
            )
            .first();

    return {
      seasonNumber,
      name: meta.name,
      airDate: meta.airDate,
      episodeCount: meta.episodeCount,
      anilistId: mapping?.anilistId ?? meta.anilistId,
      anilistEpisodeMappingCount: meta.anilistEpisodeMappingCount,
      anilistEpisodeMappings: mapping
        ? [
            {
              episodeNumber: mapping.episodeNumber,
              anilistId: mapping.anilistId,
              anilistEpisodeNumber: mapping.anilistEpisodeNumber
            }
          ]
        : undefined
    };
  }
});
