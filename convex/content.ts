import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query, internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  toContentMeta,
  toContentDetail,
  toFeaturedContentMeta,
  type ContentMeta,
  type ContentDetail,
  type FeaturedContentMeta
} from "../shared/contentMetadata";

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

export const getHomepageContent = query({
  args: {},
  handler: async (ctx) => {
    const [featured, trending, popular, newReleases, movies, tvShows] = await Promise.all([
      ctx.db
        .query("content")
        .withIndex("by_featured", (q) => q.eq("featured", true))
        .first(),
      ctx.db
        .query("content")
        .withIndex("by_trending", (q) => q.eq("trending", true))
        .take(24),
      ctx.db
        .query("content")
        .withIndex("by_popular", (q) => q.eq("popular", true))
        .take(24),
      ctx.db
        .query("content")
        .withIndex("by_new", (q) => q.eq("new", true))
        .take(24),
      ctx.db
        .query("content")
        .withIndex("by_type", (q) => q.eq("type", "movie"))
        .take(24),
      ctx.db
        .query("content")
        .withIndex("by_type", (q) => q.eq("type", "tv"))
        .take(24)
    ]);

    return {
      featured: featured ? toFeaturedContentMeta(featured) : null,
      categories: [
        { id: "trending", title: "Trending Now 🔥", content: trending.map(toContentMeta) },
        { id: "popular", title: "Popular on FishyStream", content: popular.map(toContentMeta) },
        { id: "new", title: "New Releases", content: newReleases.map(toContentMeta) },
        { id: "movies", title: "Movies", content: movies.map(toContentMeta) },
        { id: "tvshows", title: "TV Shows", content: tvShows.map(toContentMeta) }
      ].filter((category) => category.content.length > 0)
    };
  }
});

export const listPopularContent = query({
  handler: async (ctx): Promise<ContentMeta[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_popular", (q) => q.eq("popular", true))
      .take(24);
    return items.map(toContentMeta);
  }
});

export const listNewReleaseContent = query({
  handler: async (ctx): Promise<ContentMeta[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_new", (q) => q.eq("new", true))
      .take(24);
    return items.map(toContentMeta);
  }
});

export const getContentById = query({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<ContentDetail | null> => {
    const content = await ctx.db.get(id);
    return content ? toContentDetail(content) : null;
  }
});

export const getContentByTmdbId = query({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }): Promise<ContentDetail | null> => {
    const content = await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();
    return content ? toContentDetail(content) : null;
  }
});

export const listContentPage = query({
  args: {
    type: v.union(v.literal("movie"), v.literal("tv")),
    sortBy: v.optional(
      v.union(
        v.literal("trending"),
        v.literal("popular"),
        v.literal("new"),
        v.literal("rating"),
        v.literal("year")
      )
    ),
    paginationOpts: paginationOptsValidator
  },
  handler: async (ctx, { type, sortBy = "popular", paginationOpts }) => {
    let results;

    switch (sortBy) {
      case "trending":
        results = await ctx.db
          .query("content")
          .withIndex("by_type_trending", (q) => q.eq("type", type))
          .order("desc")
          .paginate(paginationOpts);
        break;
      case "new":
        results = await ctx.db
          .query("content")
          .withIndex("by_type_new", (q) => q.eq("type", type))
          .order("desc")
          .paginate(paginationOpts);
        break;
      case "rating":
        results = await ctx.db
          .query("content")
          .withIndex("by_type_vote_average", (q) => q.eq("type", type))
          .order("desc")
          .paginate(paginationOpts);
        break;
      case "year":
        results = await ctx.db
          .query("content")
          .withIndex("by_type_year", (q) => q.eq("type", type))
          .order("desc")
          .paginate(paginationOpts);
        break;
      default:
        results = await ctx.db
          .query("content")
          .withIndex("by_type_popular", (q) => q.eq("type", type))
          .order("desc")
          .paginate(paginationOpts);
        break;
    }

    return {
      ...results,
      page: results.page.map(toContentMeta)
    };
  }
});

export const listContentPageByGenre = query({
  args: {
    type: v.union(v.literal("movie"), v.literal("tv")),
    genre: v.string(),
    sortBy: v.optional(
      v.union(
        v.literal("trending"),
        v.literal("popular"),
        v.literal("new"),
        v.literal("rating"),
        v.literal("year")
      )
    ),
    page: v.optional(v.number()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { type, genre, sortBy = "popular", page = 1, limit = 24 }) => {
    const takeCount = Math.max(page * limit * 6, 180);
    let items;

    switch (sortBy) {
      case "trending":
        items = await ctx.db
          .query("content")
          .withIndex("by_type_trending", (q) => q.eq("type", type))
          .order("desc")
          .take(takeCount);
        break;
      case "new":
        items = await ctx.db
          .query("content")
          .withIndex("by_type_new", (q) => q.eq("type", type))
          .order("desc")
          .take(takeCount);
        break;
      case "rating":
        items = await ctx.db
          .query("content")
          .withIndex("by_type_vote_average", (q) => q.eq("type", type))
          .order("desc")
          .take(takeCount);
        break;
      case "year":
        items = await ctx.db
          .query("content")
          .withIndex("by_type_year", (q) => q.eq("type", type))
          .order("desc")
          .take(takeCount);
        break;
      default:
        items = await ctx.db
          .query("content")
          .withIndex("by_type_popular", (q) => q.eq("type", type))
          .order("desc")
          .take(takeCount);
        break;
    }

    items = items.filter((c) => c.genre.some((g) => g.toLowerCase() === genre.toLowerCase()));

    switch (sortBy) {
      case "trending":
      case "new":
      case "rating":
      case "year":
      default:
        break;
    }

    const normalizedPage = Math.max(1, Math.floor(page));
    const start = (normalizedPage - 1) * limit;
    const pageItems = items.slice(start, start + limit);
    const nextCursor =
      start + limit < items.length ? pageItems[pageItems.length - 1]?._id : undefined;

    return { items: pageItems.map(toContentMeta), nextCursor, totalCount: items.length };
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

export const getSyncMetadataByTmdbId = internalQuery({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }) => {
    const content = await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();

    if (!content) return null;

    return {
      _id: content._id,
      trending: content.trending,
      popular: content.popular,
      featured: content.featured,
      new: content.new
    };
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

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnitInterval(seed: string): number {
  return hashString(seed) / 4294967295;
}

export const listRecommendedContent = query({
  args: {
    watchlistIds: v.array(v.id("content")),
    limit: v.optional(v.number()),
    typeFilter: v.optional(v.union(v.literal("all"), v.literal("movie"), v.literal("tv"))),
    refreshSeed: v.optional(v.number())
  },
  handler: async (
    ctx,
    { watchlistIds, limit = 12, typeFilter = "all", refreshSeed = 0 }
  ): Promise<ContentMeta[]> => {
    if (watchlistIds.length === 0) return [];

    const watchlistItems = (await Promise.all(watchlistIds.map((id) => ctx.db.get(id)))).filter(
      Boolean
    ) as Doc<"content">[];

    if (watchlistItems.length === 0) return [];

    const watchlistGenres = new Map<string, number>();
    const watchlistTypes = new Map<string, number>();

    for (const item of watchlistItems) {
      watchlistTypes.set(item.type, (watchlistTypes.get(item.type) || 0) + 1);
      for (const genre of item.genre) {
        watchlistGenres.set(genre, (watchlistGenres.get(genre) || 0) + 1);
      }
    }

    const preferredType =
      Array.from(watchlistTypes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "movie";
    const watchlistIdSet = new Set(watchlistItems.map((item) => item._id));
    const watchlistSignature = watchlistItems
      .map((item) => String(item._id))
      .sort()
      .join("|");

    const candidateSource =
      typeFilter === "all"
        ? await ctx.db.query("content").take(180)
        : await ctx.db
            .query("content")
            .withIndex("by_type", (q) => q.eq("type", typeFilter))
            .take(180);

    const filtered = candidateSource.filter((item) => !watchlistIdSet.has(item._id));
    const poolSize = Math.min(filtered.length, limit * 3 + refreshSeed * 5);
    const pool = [...filtered]
      .sort((a, b) => {
        const aSeed = seededUnitInterval(
          `${watchlistSignature}:${typeFilter}:${refreshSeed}:${String(a._id)}`
        );
        const bSeed = seededUnitInterval(
          `${watchlistSignature}:${typeFilter}:${refreshSeed}:${String(b._id)}`
        );
        return aSeed - bSeed;
      })
      .slice(0, poolSize);

    return pool
      .map((item) => {
        let score = 0;
        score +=
          seededUnitInterval(
            `${watchlistSignature}:${typeFilter}:${refreshSeed}:score:${String(item._id)}`
          ) * 15;
        if (item.type === preferredType) score += 2;
        for (const genre of item.genre) {
          score += (watchlistGenres.get(genre) || 0) * 1.5;
        }
        if (item.popular) score += 1;
        if (item.voteAverage && item.voteAverage > 7) score += 0.5;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => toContentMeta(item));
  }
});
