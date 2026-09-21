import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  mediaState: defineTable({
    clerkUserId: v.string(),
    contentId: v.string(),
    title: v.string(),
    posterUrl: v.string(),
    positionSeconds: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    source: v.optional(v.string()),
    dub: v.optional(v.boolean()),
    watchedAt: v.optional(v.number())
  })
    .index("by_clerk_content", ["clerkUserId", "contentId"])
    .index("by_clerk_watched_at", ["clerkUserId", "watchedAt"]),

  watchlist: defineTable({
    clerkUserId: v.string(),
    contentId: v.string(),
    addedAt: v.number(),
    folder: v.optional(v.string())
  })
    .index("by_clerk_content", ["clerkUserId", "contentId"])
    .index("by_clerk_added", ["clerkUserId", "addedAt"])
    .index("by_clerk_folder", ["clerkUserId", "folder", "addedAt"]),

  watchlistIds: defineTable({
    clerkUserId: v.string(),
    contentIds: v.array(v.string())
  }).index("by_clerk", ["clerkUserId"]),

  watchlistCounts: defineTable({
    clerkUserId: v.string(),
    total: v.number(),
    unsorted: v.number(),
    folderCounts: v.array(v.object({ name: v.string(), count: v.number() }))
  }).index("by_clerk", ["clerkUserId"]),

  watchlistContent: defineTable({
    contentId: v.string(),
    title: v.string(),
    posterUrl: v.string()
  }).index("by_content", ["contentId"]),

  seasonEpisodes: defineTable({
    contentId: v.string(),
    tmdbId: v.string(),
    seasonNumber: v.number(),
    overview: v.optional(v.string()),
    anilistId: v.optional(v.string()),
    anilistEpisodeMappingCount: v.optional(v.number()),
    episodeOffset: v.optional(v.number()),
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
    episodeOffset: v.optional(v.number()),
    mappingVersion: v.optional(v.number()),
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
