import { v } from "convex/values";
import { query, mutation, internalMutation, internalAction } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

export const getFeatured = query({
  handler: async (ctx): Promise<Doc<"content"> | null> => {
    const featured = await ctx.db
      .query("content")
      .withIndex("by_featured", (q) => q.eq("featured", true))
      .first();
    return featured;
  },
});

export const getTrending = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_trending", (q) => q.eq("trending", true))
      .take(20);
  },
});

export const getPopular = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_popular", (q) => q.eq("popular", true))
      .take(20);
  },
});

export const getNewReleases = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_new", (q) => q.eq("new", true))
      .take(20);
  },
});

export const getMovies = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "movie"))
      .take(50);
  },
});

export const getTVShows = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "tv"))
      .take(50);
  },
});

export const getById = query({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<Doc<"content"> | null> => {
    return await ctx.db.get(id);
  },
});

export const getByTmdbId = query({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }): Promise<Doc<"content"> | null> => {
    return await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, { query }): Promise<Doc<"content">[]> => {
    const allContent = await ctx.db.query("content").take(100);
    const lowerQuery = query.toLowerCase();
    return allContent.filter(
      (c) =>
        c.title.toLowerCase().includes(lowerQuery) ||
        c.description.toLowerCase().includes(lowerQuery) ||
        c.genre.some((g) => g.toLowerCase().includes(lowerQuery))
    );
  },
});

export const getByGenre = query({
  args: { genre: v.string() },
  handler: async (ctx, { genre }): Promise<Doc<"content">[]> => {
    const allContent = await ctx.db.query("content").take(100);
    return allContent.filter((c) =>
      c.genre.some((g) => g.toLowerCase() === genre.toLowerCase())
    );
  },
});

export const create = mutation({
  args: {
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
  },
  handler: async (ctx, args): Promise<Doc<"content">["_id"]> => {
    const now = Date.now();
    return await ctx.db.insert("content", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("content"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    genre: v.optional(v.array(v.string())),
    year: v.optional(v.number()),
    rating: v.optional(v.string()),
    duration: v.optional(v.string()),
    seasons: v.optional(v.number()),
    posterUrl: v.optional(v.string()),
    backdropUrl: v.optional(v.string()),
    vidkingUrl: v.optional(v.string()),
    trending: v.optional(v.boolean()),
    popular: v.optional(v.boolean()),
    featured: v.optional(v.boolean()),
    new: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<void> => {
    await ctx.db.delete(id);
  },
});

export const createFromTMDB = internalMutation({
  args: {
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
    tmdbId: v.optional(v.string()),
    imdbId: v.optional(v.string()),
    trending: v.boolean(),
    popular: v.boolean(),
    featured: v.boolean(),
    new: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args): Promise<void> => {
    const existing = await ctx.db
      .query("content")
      .filter(q => q.eq(q.field("tmdbId"), args.tmdbId))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("content", args);
    }
  },
});

export const seed = internalMutation({
  handler: async (ctx): Promise<void> => {
    const existing = await ctx.db.query("content").first();
    if (existing) {
      return;
    }
  },
});
