import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

type ContentCardItem = Pick<
  Doc<"content">,
  | "_id"
  | "_creationTime"
  | "title"
  | "type"
  | "genre"
  | "year"
  | "rating"
  | "voteAverage"
  | "popular"
  | "posterUrl"
  | "tmdbId"
  | "new"
>;

function toContentCardItem(content: Doc<"content">): ContentCardItem {
  return {
    _id: content._id,
    _creationTime: content._creationTime,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    rating: content.rating,
    voteAverage: content.voteAverage,
    popular: content.popular,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new
  };
}

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
  anilistId: v.optional(v.string()),
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

export const getHomepage = query({
  args: {},
  handler: async (ctx) => {
    const [featured, trending, popular, newReleases, movies, tvShows] = await Promise.all([
      ctx.db
        .query("content")
        .withIndex("by_featured", (q) => q.eq("featured", true))
        .first(),
      ctx.db.query("content").withIndex("by_trending", (q) => q.eq("trending", true)).take(24),
      ctx.db.query("content").withIndex("by_popular", (q) => q.eq("popular", true)).take(24),
      ctx.db.query("content").withIndex("by_new", (q) => q.eq("new", true)).take(24),
      ctx.db.query("content").withIndex("by_type", (q) => q.eq("type", "movie")).take(24),
      ctx.db.query("content").withIndex("by_type", (q) => q.eq("type", "tv")).take(24)
    ]);

    return {
      featured,
      categories: [
        { id: "trending", title: "Trending Now 🔥", content: trending.map(toContentCardItem) },
        { id: "popular", title: "Popular on FishyStream", content: popular.map(toContentCardItem) },
        { id: "new", title: "New Releases", content: newReleases.map(toContentCardItem) },
        { id: "movies", title: "Movies", content: movies.map(toContentCardItem) },
        { id: "tvshows", title: "TV Shows", content: tvShows.map(toContentCardItem) }
      ].filter((category) => category.content.length > 0)
    };
  }
});

export const getTrending = query({
  handler: async (ctx): Promise<ContentCardItem[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_trending", (q) => q.eq("trending", true))
      .take(24);
    return items.map(toContentCardItem);
  }
});

export const getPopular = query({
  handler: async (ctx): Promise<ContentCardItem[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_popular", (q) => q.eq("popular", true))
      .take(24);
    return items.map(toContentCardItem);
  }
});

export const getNewReleases = query({
  handler: async (ctx): Promise<ContentCardItem[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_new", (q) => q.eq("new", true))
      .take(24);
    return items.map(toContentCardItem);
  }
});

export const getMovies = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 60 }): Promise<ContentCardItem[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "movie"))
      .take(limit);
    return items.map(toContentCardItem);
  }
});

export const getTVShows = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 60 }): Promise<ContentCardItem[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "tv"))
      .take(limit);
    return items.map(toContentCardItem);
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
    const candidates = await ctx.db.query("content").take(300);
    return candidates
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
      v.union(
        v.literal("trending"),
        v.literal("popular"),
        v.literal("new"),
        v.literal("rating"),
        v.literal("year")
      )
    ),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { type, genre, sortBy = "popular", cursor, limit = 48 }) => {
    const pageSize = limit ?? 48;

    if ((sortBy === "trending" || sortBy === "popular") && !genre && type) {
      const prioritized = await ctx.db
        .query("content")
        .withIndex(sortBy === "trending" ? "by_trending" : "by_popular", (q) => q.eq(sortBy, true))
        .filter((q) => q.eq(q.field("type"), type))
        .take(1024);

      const nonPrioritized = await ctx.db
        .query("content")
        .withIndex("by_type", (q) => q.eq("type", type))
        .filter((q) => q.eq(q.field(sortBy), false))
        .take(1024);

      const items = [...prioritized, ...nonPrioritized];
      const start = cursor ? items.findIndex((c) => c._id === cursor) + 1 : 0;
      const page = items.slice(start, start + pageSize);
      const nextCursor = page.length === pageSize ? page[page.length - 1]?._id : undefined;

      return { items: page.map(toContentCardItem), nextCursor, totalCount: items.length };
    }

    let items: Doc<"content">[];

    if (type) {
      items = await ctx.db
        .query("content")
        .withIndex("by_type", (q) => q.eq("type", type))
        .take(1024);
    } else {
      items = await ctx.db.query("content").take(1024);
    }

    if (genre) {
      items = items.filter((c) => c.genre.some((g) => g.toLowerCase() === genre.toLowerCase()));
    }

    switch (sortBy) {
      case "trending":
        items = items.filter((c) => c.trending).concat(items.filter((c) => !c.trending));
        break;
      case "new":
        items = items.filter((c) => c.new).concat(items.filter((c) => !c.new));
        break;
      case "rating":
        items.sort((a, b) => (b.voteAverage ?? 0) - (a.voteAverage ?? 0));
        break;
      case "year":
        items.sort((a, b) => b.year - a.year);
        break;
      default:
        items = items.filter((c) => c.popular).concat(items.filter((c) => !c.popular));
    }

    const start = cursor ? items.findIndex((c) => c._id === cursor) + 1 : 0;
    const page = items.slice(start, start + pageSize);
    const nextCursor = page.length === pageSize ? page[page.length - 1]?._id : undefined;

    return { items: page.map(toContentCardItem), nextCursor, totalCount: items.length };
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
    anilistId: v.optional(v.string()),
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
    const content = await ctx.db.query("content").take(10000);
    return content.map((c) => ({ tmdbId: c.tmdbId, type: c.type }));
  }
});

export const getAnimeMissingAniListIds = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 250 }) => {
    const content = await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "tv"))
      .take(5000);

    return content
      .filter(
        (item) =>
          !item.anilistId &&
          item.originalLanguage?.toLowerCase() === "ja" &&
          item.genre.some((genre) => genre.toLowerCase() === "animation")
      )
      .slice(0, limit)
      .map((item) => ({
        id: item._id,
        tmdbId: item.tmdbId,
        title: item.title,
        year: item.year
      }));
  }
});

export const setAniListId = internalMutation({
  args: {
    id: v.id("content"),
    anilistId: v.string()
  },
  handler: async (ctx, { id, anilistId }) => {
    await ctx.db.patch(id, {
      anilistId,
      updatedAt: Date.now()
    });
  }
});

export const getAll = query({
  args: {},
  handler: async (ctx): Promise<ContentCardItem[]> => {
    const items = await ctx.db.query("content").take(300);
    return items.map(toContentCardItem);
  }
});
