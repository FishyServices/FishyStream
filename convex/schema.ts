import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const mediaType = v.union(v.literal("movie"), v.literal("tv"));

export default defineSchema({
  watchlist: defineTable({
    clerkUserId: v.string(),
    contentId: v.string(),
    tmdbId: v.string(),
    contentType: mediaType,
    title: v.string(),
    posterUrl: v.string(),
    genre: v.optional(v.array(v.string())),
    year: v.optional(v.number()),
    voteAverage: v.optional(v.number()),
    addedAt: v.number(),
    folder: v.optional(v.string())
  })
    .index("by_clerk_added_at", ["clerkUserId", "addedAt"])
    .index("by_clerk_content", ["clerkUserId", "contentId"]),

  watchProgress: defineTable({
    clerkUserId: v.string(),
    contentId: v.string(),
    tmdbId: v.string(),
    contentType: mediaType,
    title: v.string(),
    posterUrl: v.string(),
    genre: v.optional(v.array(v.string())),
    year: v.optional(v.number()),
    voteAverage: v.optional(v.number()),
    progress: v.number(),
    positionSeconds: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    source: v.optional(v.string()),
    dub: v.optional(v.boolean()),
    completed: v.boolean(),
    watchedAt: v.number(),
    clientUpdatedAt: v.optional(v.number()),
    serverUpdatedAt: v.optional(v.number())
  })
    .index("by_clerk_watched_at", ["clerkUserId", "watchedAt"])
    .index("by_clerk_content", ["clerkUserId", "contentId"])
    .index("by_clerk_completed_watched_at", ["clerkUserId", "completed", "watchedAt"]),

  seasonEpisodes: defineTable({
    contentId: v.string(),
    tmdbId: v.string(),
    seasonNumber: v.number(),
    overview: v.optional(v.string()),
    anilistId: v.optional(v.string()),
    anilistEpisodeMappingCount: v.optional(v.number()),
    episodes: v.array(v.any()),
    updatedAt: v.number(),
    payloadHash: v.string()
  })
    .index("by_content_season", ["contentId", "seasonNumber"])
    .index("by_tmdb_season", ["tmdbId", "seasonNumber"]),

  seasonPlaybackMeta: defineTable({
    contentId: v.string(),
    seasonNumber: v.number(),
    name: v.string(),
    airDate: v.optional(v.string()),
    episodeCount: v.number(),
    storedEpisodeCount: v.number(),
    anilistId: v.optional(v.string()),
    anilistEpisodeMappingCount: v.optional(v.number()),
    seasonEpisodePayloadHash: v.optional(v.string())
  }).index("by_content_season", ["contentId", "seasonNumber"]),

  seasonEpisodeMappings: defineTable({
    contentId: v.string(),
    seasonNumber: v.number(),
    episodeNumber: v.number(),
    anilistId: v.string(),
    anilistEpisodeNumber: v.number(),
    updatedAt: v.number()
  })
    .index("by_content_season_episode", ["contentId", "seasonNumber", "episodeNumber"])
    .index("by_content_season", ["contentId", "seasonNumber"])
});
