import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const tmdbContentValidator = v.object({
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
  trending: v.boolean(),
  popular: v.boolean(),
  featured: v.boolean(),
  new: v.boolean(),
  status: v.optional(v.string()),
  tagline: v.optional(v.string()),
  originalLanguage: v.optional(v.string()),
  productionCountries: v.optional(v.array(v.string())),
  spokenLanguages: v.optional(v.array(v.string())),
  budget: v.optional(v.number()),
  revenue: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number()
});

export const getFeatured = query({
  handler: async (ctx): Promise<Doc<"content"> | null> => {
    return await ctx.db
      .query("content")
      .withIndex("by_featured", (q) => q.eq("featured", true))
      .first();
  }
});

export const getTrending = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_trending", (q) => q.eq("trending", true))
      .take(24);
  }
});

export const getPopular = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_popular", (q) => q.eq("popular", true))
      .take(24);
  }
});

export const getNewReleases = query({
  handler: async (ctx): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_new", (q) => q.eq("new", true))
      .take(24);
  }
});

export const getMovies = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 60 }): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "movie"))
      .take(limit);
  }
});

export const getTVShows = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 60 }): Promise<Doc<"content">[]> => {
    return await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "tv"))
      .take(limit);
  }
});

export const getById = query({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<Doc<"content"> | null> => {
    return await ctx.db.get(id);
  }
});

export const getByTmdbId = query({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }): Promise<Doc<"content"> | null> => {
    return await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();
  }
});

export const getByGenre = query({
  args: { genre: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { genre, limit = 24 }): Promise<Doc<"content">[]> => {
    const all = await ctx.db.query("content").take(500);
    return all
      .filter((c) => c.genre.some((g) => g.toLowerCase() === genre.toLowerCase()))
      .slice(0, limit);
  }
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, { query: q }): Promise<Doc<"content">[]> => {
    if (!q.trim()) return [];

    const results = await ctx.db
      .query("content")
      .withSearchIndex("search_title", (s) => s.search("title", q))
      .take(20);

    return results;
  }
});

export const getByIds = query({
  args: { ids: v.array(v.id("content")) },
  handler: async (ctx, { ids }): Promise<Doc<"content">[]> => {
    const results = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return results.filter(Boolean) as Doc<"content">[];
  }
});

export const getSimilar = query({
  args: { contentId: v.id("content"), limit: v.optional(v.number()) },
  handler: async (ctx, { contentId, limit = 12 }): Promise<Doc<"content">[]> => {
    const source = await ctx.db.get(contentId);
    if (!source) return [];

    const all = await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", source.type))
      .take(200);

    return all
      .filter((c) => c._id !== contentId && c.genre.some((g) => source.genre.includes(g)))
      .sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0))
      .slice(0, limit);
  }
});

export const getPaginated = query({
  args: {
    type: v.optional(v.union(v.literal("movie"), v.literal("tv"))),
    genre: v.optional(v.string()),
    sortBy: v.optional(
      v.union(v.literal("popular"), v.literal("new"), v.literal("rating"), v.literal("year"))
    ),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { type, genre, sortBy = "popular", cursor, limit = 48 }) => {
    let items: Doc<"content">[];

    if (type) {
      items = await ctx.db
        .query("content")
        .withIndex("by_type", (q) => q.eq("type", type))
        .take(500);
    } else {
      items = await ctx.db.query("content").take(500);
    }

    if (genre) {
      items = items.filter((c) => c.genre.some((g) => g.toLowerCase() === genre.toLowerCase()));
    }

    // Sort
    switch (sortBy) {
      case "new":
        items = items.filter((c) => c.new).concat(items.filter((c) => !c.new));
        break;
      case "rating":
        items.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
        break;
      case "year":
        items.sort((a, b) => b.year - a.year);
        break;
      default: // popular
        items = items.filter((c) => c.popular).concat(items.filter((c) => !c.popular));
    }

    const start = cursor ? items.findIndex((c) => c._id === cursor) + 1 : 0;
    const page = items.slice(start, start + limit);
    const nextCursor = page.length === limit ? page[page.length - 1]?._id : undefined;

    return { items: page, nextCursor, totalCount: items.length };
  }
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
    imdbId: v.optional(v.string()),
    tmdbId: v.optional(v.string()),
    trending: v.boolean(),
    popular: v.boolean(),
    featured: v.boolean(),
    new: v.boolean()
  },
  handler: async (ctx, args): Promise<Doc<"content">["_id"]> => {
    const now = Date.now();
    return await ctx.db.insert("content", { ...args, createdAt: now, updatedAt: now });
  }
});

export const update = mutation({
  args: {
    id: v.id("content"),
    trending: v.optional(v.boolean()),
    popular: v.optional(v.boolean()),
    featured: v.optional(v.boolean()),
    new: v.optional(v.boolean()),
    posterUrl: v.optional(v.string()),
    backdropUrl: v.optional(v.string())
  },
  handler: async (ctx, args): Promise<void> => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, { ...updates, updatedAt: Date.now() });
  }
});

export const remove = mutation({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<void> => {
    await ctx.db.delete(id);
  }
});

export const upsertBatchFromTMDB = internalMutation({
  args: { items: v.array(tmdbContentValidator) },
  handler: async (ctx, { items }): Promise<number> => {
    let count = 0;
    for (const item of items) {
      const existing = await ctx.db
        .query("content")
        .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", item.tmdbId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { ...item, updatedAt: Date.now() });
      } else {
        await ctx.db.insert("content", item);
      }
      count++;
    }
    return count;
  }
});

export const getAllTmdbIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const content = await ctx.db.query("content").take(5000);
    return content.map((c) => ({ tmdbId: c.tmdbId, type: c.type }));
  }
});
