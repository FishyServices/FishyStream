import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const mediaType = v.union(v.literal("movie"), v.literal("tv"));

const sortKeysValidator = v.object({
  popular: v.number(),
  trending: v.number(),
  new: v.number(),
  rating: v.number(),
  year: v.number()
});

const cardSnapshotFields = {
  contentType: mediaType,
  title: v.string(),
  genre: v.array(v.string()),
  year: v.number(),
  voteAverage: v.optional(v.number()),
  posterUrl: v.string(),
  tmdbId: v.optional(v.string()),
  new: v.boolean(),
  snapshotUpdatedAt: v.number()
};

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_clerk_user_id", ["clerkUserId"]),

  content: defineTable({
    tmdbId: v.string(),
    type: mediaType,
    title: v.string(),
    genre: v.array(v.string()),
    genreKeys: v.array(v.string()),
    year: v.number(),
    posterUrl: v.string(),
    voteAverage: v.optional(v.number()),
    popularity: v.optional(v.number()),
    new: v.boolean(),
    trending: v.boolean(),
    popular: v.boolean(),
    featured: v.boolean(),
    sortKeys: sortKeysValidator,
    syncHash: v.string(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_tmdb_id", ["tmdbId"])
    .index("by_type_tmdb_id", ["type", "tmdbId"])
    .index("by_type", ["type"])
    .index("by_type_popular", ["type", "sortKeys.popular"])
    .index("by_type_trending", ["type", "sortKeys.trending"])
    .index("by_type_new", ["type", "sortKeys.new"])
    .index("by_type_rating", ["type", "sortKeys.rating"])
    .index("by_type_year", ["type", "sortKeys.year"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["type"]
    }),

  contentDetails: defineTable({
    contentId: v.id("content"),
    tmdbId: v.string(),
    title: v.string(),
    type: mediaType,
    genre: v.array(v.string()),
    genreKeys: v.array(v.string()),
    year: v.number(),
    voteAverage: v.optional(v.number()),
    popularity: v.optional(v.number()),
    posterUrl: v.string(),
    backdropUrl: v.string(),
    description: v.string(),
    rating: v.string(),
    logoUrl: v.optional(v.string()),
    trailerKey: v.optional(v.string()),
    imdbId: v.optional(v.string()),
    anilistId: v.optional(v.string()),
    originalLanguage: v.optional(v.string()),
    duration: v.optional(v.string()),
    seasons: v.optional(v.number()),
    totalEpisodes: v.optional(v.number()),
    tagline: v.optional(v.string()),
    status: v.optional(v.string()),
    trending: v.boolean(),
    popular: v.boolean(),
    featured: v.boolean(),
    new: v.boolean(),
    syncHash: v.string(),
    updatedAt: v.number()
  })
    .index("by_content", ["contentId"])
    .index("by_tmdb_id", ["tmdbId"])
    .index("by_type_tmdb_id", ["type", "tmdbId"]),

  homeViews: defineTable({
    key: v.string(),
    featured: v.array(v.any()),
    rows: v.array(
      v.object({
        id: v.string(),
        title: v.string(),
        content: v.array(v.any())
      })
    ),
    updatedAt: v.number(),
    sourceHash: v.string()
  }).index("by_key", ["key"]),

  catalogPages: defineTable({
    key: v.string(),
    type: mediaType,
    sortBy: v.union(
      v.literal("trending"),
      v.literal("popular"),
      v.literal("new"),
      v.literal("rating"),
      v.literal("year")
    ),
    genreKey: v.optional(v.string()),
    page: v.number(),
    limit: v.number(),
    items: v.array(v.any()),
    hasNextPage: v.boolean(),
    updatedAt: v.number(),
    sourceHash: v.string()
  }).index("by_key", ["key"]),

  recommendationPools: defineTable({
    key: v.string(),
    type: mediaType,
    genreKey: v.optional(v.string()),
    items: v.array(v.any()),
    updatedAt: v.number(),
    sourceHash: v.string()
  }).index("by_key", ["key"]),

  seasonIndex: defineTable({
    contentId: v.id("content"),
    tmdbId: v.string(),
    summaries: v.array(v.any()),
    updatedAt: v.number(),
    payloadHash: v.string()
  })
    .index("by_content", ["contentId"])
    .index("by_tmdb", ["tmdbId"]),

  seasonEpisodes: defineTable({
    contentId: v.id("content"),
    tmdbId: v.string(),
    seasonNumber: v.number(),
    overview: v.optional(v.string()),
    anilistId: v.optional(v.string()),
    anilistEpisodeMappingPack: v.optional(v.string()),
    anilistEpisodeMappingCount: v.optional(v.number()),
    episodes: v.array(v.any()),
    updatedAt: v.number(),
    payloadHash: v.string()
  })
    .index("by_content_season", ["contentId", "seasonNumber"])
    .index("by_tmdb_season", ["tmdbId", "seasonNumber"]),

  seasonPlaybackMeta: defineTable({
    contentId: v.id("content"),
    tmdbId: v.string(),
    seasonNumber: v.number(),
    name: v.string(),
    airDate: v.optional(v.string()),
    episodeCount: v.number(),
    storedEpisodeCount: v.number(),
    anilistId: v.optional(v.string()),
    anilistEpisodeMappingPack: v.optional(v.string()),
    anilistEpisodeMappingCount: v.optional(v.number()),
    seasonEpisodePayloadHash: v.optional(v.string()),
    updatedAt: v.number(),
    payloadHash: v.string()
  })
    .index("by_content_season", ["contentId", "seasonNumber"])
    .index("by_tmdb_season", ["tmdbId", "seasonNumber"]),

  watchlist: defineTable({
    clerkUserId: v.string(),
    contentId: v.id("content"),
    addedAt: v.number(),
    folder: v.optional(v.string()),
    contentType: mediaType,
    title: v.string(),
    genre: v.array(v.string()),
    posterUrl: v.string(),
    tmdbId: v.optional(v.string()),
    year: v.optional(v.number()),
    voteAverage: v.optional(v.number()),
    new: v.optional(v.boolean()),
    snapshotUpdatedAt: v.optional(v.number())
  })
    .index("by_clerk_added_at", ["clerkUserId", "addedAt"])
    .index("by_clerk_content", ["clerkUserId", "contentId"]),

  watchProgress: defineTable({
    clerkUserId: v.string(),
    contentId: v.id("content"),
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
    serverUpdatedAt: v.optional(v.number()),
    ...cardSnapshotFields
  })
    .index("by_clerk_watched_at", ["clerkUserId", "watchedAt"])
    .index("by_clerk_content", ["clerkUserId", "contentId"])
    .index("by_clerk_completed_watched_at", ["clerkUserId", "completed", "watchedAt"]),

  syncRuns: defineTable({
    key: v.string(),
    status: v.string(),
    message: v.optional(v.string()),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    stats: v.optional(v.any())
  }).index("by_key", ["key"])
});
