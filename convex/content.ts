import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  toContentDetail,
  toContentMeta,
  toFeaturedContentMeta,
  type ContentDetail,
  type ContentMeta,
  type FeaturedContentMeta
} from "../shared/contentMetadata";

const contentTypeValidator = v.union(v.literal("movie"), v.literal("tv"));
const browseSortValidator = v.union(
  v.literal("trending"),
  v.literal("popular"),
  v.literal("new"),
  v.literal("rating"),
  v.literal("year")
);

const tmdbContentValidator = v.object({
  title: v.string(),
  description: v.string(),
  type: contentTypeValidator,
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

const HOMEPAGE_ROW_LIMIT = 12;

type BrowseSort = "trending" | "popular" | "new" | "rating" | "year";

async function readSortedContent(
  ctx: QueryCtx,
  type: "movie" | "tv",
  sortBy: BrowseSort,
  takeCount: number
) {
  switch (sortBy) {
    case "trending":
      return await ctx.db
        .query("content")
        .withIndex("by_type_trending", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
    case "new":
      return await ctx.db
        .query("content")
        .withIndex("by_type_new", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
    case "rating":
      return await ctx.db
        .query("content")
        .withIndex("by_type_vote_average", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
    case "year":
      return await ctx.db
        .query("content")
        .withIndex("by_type_year", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
    default:
      return await ctx.db
        .query("content")
        .withIndex("by_type_popular", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
  }
}

function normalizePage(page?: number) {
  return Math.max(1, Math.floor(page ?? 1));
}

function normalizeLimit(limit?: number, max = 48) {
  return Math.max(1, Math.min(max, Math.floor(limit ?? 24)));
}

function lower(value?: string) {
  return value?.toLowerCase().trim();
}

async function getBrowsePageData(
  ctx: QueryCtx,
  args: {
    type: "movie" | "tv";
    genre?: string;
    sortBy?: BrowseSort;
    page?: number;
    limit?: number;
  }
) {
  const page = normalizePage(args.page);
  const limit = normalizeLimit(args.limit);
  const sortBy = args.sortBy ?? "popular";
  const genre = lower(args.genre);
  const takeCount = genre ? Math.max(page * limit * 4, 120) : page * limit + 1;

  let items = await readSortedContent(ctx, args.type, sortBy, takeCount);
  if (genre) {
    items = items.filter((item) => item.genre.some((value) => lower(value) === genre));
  }

  const start = (page - 1) * limit;
  const pageItems = items.slice(start, start + limit);
  const hasNextPage = genre ? start + limit < items.length : items.length > page * limit;

  return {
    items: pageItems.map(toContentMeta),
    currentPage: page,
    totalPages: genre ? Math.max(1, Math.ceil(items.length / limit)) : undefined,
    totalCount: genre ? items.length : undefined,
    hasNextPage
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnitInterval(seed: string) {
  return hashString(seed) / 4294967295;
}

export const getHomepageContent = query({
  args: {},
  handler: async (ctx): Promise<{
    featured: FeaturedContentMeta | null;
    categories: Array<{ id: string; title: string; content: ContentMeta[] }>;
  }> => {
    const [featured, trending, popular, newReleases, movies, tvShows] = await Promise.all([
      ctx.db
        .query("content")
        .withIndex("by_featured", (q) => q.eq("featured", true))
        .first(),
      ctx.db
        .query("content")
        .withIndex("by_trending", (q) => q.eq("trending", true))
        .take(HOMEPAGE_ROW_LIMIT),
      ctx.db
        .query("content")
        .withIndex("by_popular", (q) => q.eq("popular", true))
        .take(HOMEPAGE_ROW_LIMIT),
      ctx.db
        .query("content")
        .withIndex("by_new", (q) => q.eq("new", true))
        .take(HOMEPAGE_ROW_LIMIT),
      ctx.db
        .query("content")
        .withIndex("by_type", (q) => q.eq("type", "movie"))
        .take(HOMEPAGE_ROW_LIMIT),
      ctx.db
        .query("content")
        .withIndex("by_type", (q) => q.eq("type", "tv"))
        .take(HOMEPAGE_ROW_LIMIT)
    ]);

    return {
      featured: featured ? toFeaturedContentMeta(featured) : null,
      categories: [
        { id: "trending", title: "Trending Now 🔥", content: trending.map(toContentMeta) },
        { id: "popular", title: "Popular on FishyStream", content: popular.map(toContentMeta) },
        { id: "new", title: "New Releases", content: newReleases.map(toContentMeta) },
        { id: "movies", title: "Movies", content: movies.map(toContentMeta) },
        { id: "tvshows", title: "TV Shows", content: tvShows.map(toContentMeta) }
      ].filter((row) => row.content.length > 0)
    };
  }
});

export const listPopularContent = query({
  args: {},
  handler: async (ctx): Promise<ContentMeta[]> => {
    const items = await ctx.db
      .query("content")
      .withIndex("by_popular", (q) => q.eq("popular", true))
      .take(24);
    return items.map(toContentMeta);
  }
});

export const listNewReleaseContent = query({
  args: {},
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
    const item = await ctx.db.get(id);
    return item ? toContentDetail(item) : null;
  }
});

export const getContentByTmdbId = query({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }): Promise<ContentDetail | null> => {
    const item = await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();
    return item ? toContentDetail(item) : null;
  }
});

export const listContentPage = query({
  args: {
    type: contentTypeValidator,
    sortBy: v.optional(browseSortValidator),
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

    return { ...results, page: results.page.map(toContentMeta) };
  }
});

export const listContentPageByGenre = query({
  args: {
    type: contentTypeValidator,
    genre: v.string(),
    sortBy: v.optional(browseSortValidator),
    page: v.optional(v.number()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    const result = await getBrowsePageData(ctx, args);
    return {
      items: result.items,
      nextCursor: result.hasNextPage ? result.items[result.items.length - 1]?._id : undefined,
      totalCount: result.totalCount
    };
  }
});

export const getBrowsePage = query({
  args: {
    type: contentTypeValidator,
    genre: v.optional(v.string()),
    sortBy: v.optional(browseSortValidator),
    page: v.optional(v.number()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await getBrowsePageData(ctx, args);
  }
});

export const upsertBatchFromTMDB = internalMutation({
  args: { items: v.array(tmdbContentValidator) },
  handler: async (ctx, { items }) => {
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
      count += 1;
    }
    return count;
  }
});

export const getAllTmdbIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("content").take(10000);
    return rows.map((row) => ({ tmdbId: row.tmdbId, type: row.type }));
  }
});

export const getAnimeMissingAniListIds = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 250 }) => {
    const rows = await ctx.db
      .query("content")
      .withIndex("by_type", (q) => q.eq("type", "tv"))
      .take(5000);

    return rows
      .filter(
        (row) =>
          !row.anilistId &&
          lower(row.originalLanguage) === "ja" &&
          row.genre.some((genre) => lower(genre) === "animation")
      )
      .slice(0, limit)
      .map((row) => ({
        id: row._id,
        tmdbId: row.tmdbId,
        title: row.title,
        year: row.year
      }));
  }
});

export const getSyncMetadataByTmdbId = internalQuery({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }) => {
    const item = await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();

    if (!item) return null;
    return {
      _id: item._id,
      trending: item.trending,
      popular: item.popular,
      featured: item.featured,
      new: item.new
    };
  }
});

export const setAniListId = internalMutation({
  args: { id: v.id("content"), anilistId: v.string() },
  handler: async (ctx, { id, anilistId }) => {
    await ctx.db.patch(id, { anilistId, updatedAt: Date.now() });
  }
});

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

    const watchlistItems = (
      await Promise.all(watchlistIds.map((id) => ctx.db.get(id)))
    ).filter(Boolean) as Doc<"content">[];
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
    const watchlistIdSet = new Set<Id<"content">>(watchlistItems.map((item) => item._id));
    const watchlistSignature = watchlistItems
      .map((item) => String(item._id))
      .sort()
      .join("|");
    const candidateFetchLimit = Math.max(limit * 4, 48);

    const candidates =
      typeFilter === "all"
        ? await ctx.db
            .query("content")
            .withIndex("by_type", (q) => q.eq("type", preferredType as "movie" | "tv"))
            .take(candidateFetchLimit)
        : await ctx.db
            .query("content")
            .withIndex("by_type", (q) => q.eq("type", typeFilter))
            .take(candidateFetchLimit);

    const filtered = candidates.filter((item) => !watchlistIdSet.has(item._id));
    const poolSize = Math.min(filtered.length, limit * 2 + refreshSeed * 4);
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
