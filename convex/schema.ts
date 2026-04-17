import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
    createdAt: v.number()
  }).index("by_clerk_user_id", ["clerkUserId"]),

  content: defineTable({
    title: v.string(),
    description: v.string(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    genre: v.array(v.string()),
    year: v.number(),
    rating: v.string(),
    duration: v.optional(v.string()),
    seasons: v.optional(v.number()),
    posterUrl: v.string(),
    backdropUrl: v.string(),
    vidkingUrl: v.optional(v.string()),
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string()),
    trending: v.boolean(),
    popular: v.boolean(),
    featured: v.boolean(),
    new: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_type", ["type"])
    .index("by_trending", ["trending"])
    .index("by_popular", ["popular"])
    .index("by_featured", ["featured"])
    .index("by_new", ["new"])
    .index("by_genre", ["genre"]),

  watchlist: defineTable({
    userId: v.id("users"),
    contentId: v.id("content"),
    addedAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_user_content", ["userId", "contentId"]),

  watchHistory: defineTable({
    userId: v.id("users"),
    contentId: v.id("content"),
    progress: v.number(),
    completed: v.boolean(),
    watchedAt: v.number()
  })
    .index("by_user", ["userId"])
    .index("by_user_content", ["userId", "contentId"])
});
