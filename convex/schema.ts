import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_clerk_user_id", ["clerkUserId"]),

  content: defineTable({
    title: v.string(),
    description: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    genre: v.array(v.string()),
    year: v.number(),
    rating: v.string(),
    voteAverage: v.optional(v.number()),
    voteCount: v.optional(v.number()),
    popularity: v.optional(v.number()),
    duration: v.optional(v.string()),
    seasons: v.optional(v.number()),
    totalEpisodes: v.optional(v.number()),
    posterUrl: v.string(),
    backdropUrl: v.string(),
    logoUrl: v.optional(v.string()),
    trailerKey: v.optional(v.string()),
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string()),
    anilistId: v.optional(v.string()),
    trending: v.boolean(),
    popular: v.boolean(),
    featured: v.boolean(),
    new: v.boolean(),
    status: v.optional(v.string()),
    originalLanguage: v.optional(v.string()),
    productionCountries: v.optional(v.array(v.string())),
    spokenLanguages: v.optional(v.array(v.string())),
    tagline: v.optional(v.string()),
    budget: v.optional(v.number()),
    revenue: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_type", ["type"])
    .index("by_type_trending", ["type", "trending"])
    .index("by_type_popular", ["type", "popular"])
    .index("by_type_new", ["type", "new"])
    .index("by_type_year", ["type", "year"])
    .index("by_type_vote_average", ["type", "voteAverage"])
    .index("by_trending", ["trending"])
    .index("by_popular", ["popular"])
    .index("by_featured", ["featured"])
    .index("by_new", ["new"])
    .index("by_genre", ["genre"])
    .index("by_imdb_id", ["imdbId"])
    .index("by_tmdb_id", ["tmdbId"])
    .index("by_popularity", ["popularity"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["type", "genre"]
    }),

  seasons: defineTable({
    contentId: v.id("content"),
    tmdbId: v.string(),
    anilistId: v.optional(v.string()),
    seasonNumber: v.number(),
    name: v.string(),
    overview: v.optional(v.string()),
    posterUrl: v.optional(v.string()),
    airDate: v.optional(v.string()),
    episodeCount: v.number(),
    episodes: v.array(
      v.object({
        episodeNumber: v.number(),
        name: v.string(),
        overview: v.optional(v.string()),
        stillUrl: v.optional(v.string()),
        airDate: v.optional(v.string()),
        runtime: v.optional(v.number()),
        voteAverage: v.optional(v.number())
      })
    ),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_content", ["contentId"])
    .index("by_content_season", ["contentId", "seasonNumber"])
    .index("by_tmdb", ["tmdbId"]),

  watchlist: defineTable({
    userId: v.id("users"),
    contentId: v.id("content"),
    addedAt: v.number(),
    folder: v.optional(v.string()),
    lastAcknowledgedSeasonCount: v.optional(v.number()),
    lastAcknowledgedEpisodeCount: v.optional(v.number())
  })
    .index("by_user", ["userId"])
    .index("by_user_content", ["userId", "contentId"]),

  watchHistory: defineTable({
    userId: v.id("users"),
    contentId: v.id("content"),
    progress: v.number(),
    positionSeconds: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    source: v.optional(v.string()),
    dub: v.optional(v.boolean()),
    completed: v.boolean(),
    watchedAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_user_content", ["userId", "contentId"])
    .index("by_user_watched_at", ["userId", "watchedAt"])
    .index("by_user_completed_watched_at", ["userId", "completed", "watchedAt"]),

  ratings: defineTable({
    userId: v.id("users"),
    contentId: v.id("content"),
    rating: v.number(),
    ratedAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_content", ["contentId"])
    .index("by_user_content", ["userId", "contentId"])
});
