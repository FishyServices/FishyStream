import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toContentCardWire,
  toContentDetailWire,
  toContentFeaturedWire,
  toContentPlaybackWire,
  compactContentCardWire,
  compactContentFeaturedWire,
  toImageWire,
  type ContentCardWire,
  type ContentDetailWire,
  type ContentFeaturedWire,
  type ContentPlaybackWire,
  type HomeViewWire
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
  createdAt: v.number(),
  updatedAt: v.number(),
  syncHash: v.optional(v.string())
});

type BrowseSort = "trending" | "popular" | "new" | "rating" | "year";
type ContentInput = typeof tmdbContentValidator.type;

const DEFAULT_PAGE_LIMIT = 12;
const MAX_BROWSE_PAGE_LIMIT = 12;

function normalizePage(page?: number) {
  return Math.max(1, Math.floor(page ?? 1));
}

function normalizeLimit(limit?: number, max = MAX_BROWSE_PAGE_LIMIT) {
  return Math.max(1, Math.min(max, Math.floor(limit ?? DEFAULT_PAGE_LIMIT)));
}

function genreKey(value?: string) {
  return value
    ?.toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function contentKey(item: Pick<ContentInput, "tmdbId" | "type" | "title" | "year">) {
  return item.tmdbId ?? `${item.type}:${item.title.toLowerCase()}:${item.year}`;
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function hashPayload(value: unknown) {
  return hashString(JSON.stringify(value));
}

function getContentSyncHash(item: ContentInput) {
  return hashPayload({
    title: item.title,
    description: item.description,
    type: item.type,
    genre: item.genre,
    year: item.year,
    rating: item.rating,
    voteAverage: item.voteAverage,
    voteCount: item.voteCount,
    popularity: item.popularity,
    duration: item.duration,
    seasons: item.seasons,
    totalEpisodes: item.totalEpisodes,
    posterUrl: toImageWire(item.posterUrl),
    backdropUrl: toImageWire(item.backdropUrl),
    logoUrl: item.logoUrl ? toImageWire(item.logoUrl) : undefined,
    trailerKey: item.trailerKey,
    imdbId: item.imdbId,
    tmdbId: item.tmdbId,
    anilistId: item.anilistId,
    trending: item.trending,
    popular: item.popular,
    featured: item.featured,
    new: item.new,
    status: item.status,
    tagline: item.tagline,
    originalLanguage: item.originalLanguage
  });
}

function getSortKeys(
  item: Pick<ContentInput, "popularity" | "voteAverage" | "year" | "trending" | "popular" | "new">
) {
  const popularity = item.popularity ?? 0;
  const rating = item.voteAverage ?? 0;
  return {
    popular: (item.popular ? 1_000_000 : 0) + popularity,
    trending: (item.trending ? 1_000_000 : 0) + popularity,
    new: (item.new ? 1_000_000 : 0) + item.year,
    rating,
    year: item.year
  };
}

function toLeanContent(item: ContentInput, syncHash: string, now: number) {
  const tmdbId = contentKey(item);
  const genreKeys = item.genre.map((value) => genreKey(value)).filter(Boolean) as string[];
  return {
    tmdbId,
    type: item.type,
    title: item.title,
    genre: item.genre,
    genreKeys,
    year: item.year,
    posterUrl: toImageWire(item.posterUrl),
    voteAverage: item.voteAverage,
    popularity: item.popularity,
    new: item.new,
    trending: item.trending,
    popular: item.popular,
    featured: item.featured,
    sortKeys: getSortKeys(item),
    syncHash,
    createdAt: item.createdAt ?? now,
    updatedAt: now
  };
}

function toDetailContent(
  contentId: Id<"content">,
  item: ContentInput,
  syncHash: string,
  now: number
) {
  const tmdbId = contentKey(item);
  const genreKeys = item.genre.map((value) => genreKey(value)).filter(Boolean) as string[];
  return {
    contentId,
    tmdbId,
    title: item.title,
    type: item.type,
    genre: item.genre,
    genreKeys,
    year: item.year,
    voteAverage: item.voteAverage,
    popularity: item.popularity,
    posterUrl: toImageWire(item.posterUrl),
    backdropUrl: toImageWire(item.backdropUrl),
    description: item.description,
    rating: item.rating,
    logoUrl: item.logoUrl ? toImageWire(item.logoUrl) : undefined,
    trailerKey: item.trailerKey,
    imdbId: item.imdbId,
    anilistId: item.anilistId,
    originalLanguage: item.originalLanguage,
    duration: item.duration,
    seasons: item.seasons,
    totalEpisodes: item.totalEpisodes,
    tagline: item.tagline,
    status: item.status,
    trending: item.trending,
    popular: item.popular,
    featured: item.featured,
    new: item.new,
    syncHash,
    updatedAt: now
  };
}

async function getCatalogPage(
  ctx: QueryCtx,
  args: {
    type: "movie" | "tv";
    sortBy?: BrowseSort;
    genre?: string;
    page?: number;
    limit?: number;
  }
) {
  const page = normalizePage(args.page);
  const limit = normalizeLimit(args.limit);
  const sortBy = args.sortBy ?? "popular";
  const offset = (page - 1) * limit;
  const requestedGenreKey = genreKey(args.genre);
  const readLimit = offset + limit + 1;
  const rows = await listSortedContent(ctx, args.type, sortBy, readLimit);
  const filteredRows = requestedGenreKey
    ? rows.filter((row) => row.genreKeys.includes(requestedGenreKey))
    : rows;
  const pageItems = filteredRows.slice(offset, offset + limit);
  return {
    items: pageItems.map((item) => compactContentCardWire(toContentCardWire(item))),
    totalCount: requestedGenreKey && rows.length < readLimit ? filteredRows.length : undefined,
    hasNextPage: filteredRows.length > offset + limit
  };
}

async function listSortedContent(
  ctx: QueryCtx | MutationCtx,
  type: "movie" | "tv",
  sortBy: BrowseSort,
  limit: number
) {
  switch (sortBy) {
    case "trending":
      return await ctx.db
        .query("content")
        .withIndex("by_type_trending", (q) => q.eq("type", type))
        .order("desc")
        .take(limit);
    case "new":
      return await ctx.db
        .query("content")
        .withIndex("by_type_new", (q) => q.eq("type", type))
        .order("desc")
        .take(limit);
    case "rating":
      return await ctx.db
        .query("content")
        .withIndex("by_type_rating", (q) => q.eq("type", type))
        .order("desc")
        .take(limit);
    case "year":
      return await ctx.db
        .query("content")
        .withIndex("by_type_year", (q) => q.eq("type", type))
        .order("desc")
        .take(limit);
    case "popular":
    default:
      return await ctx.db
        .query("content")
        .withIndex("by_type_popular", (q) => q.eq("type", type))
        .order("desc")
        .take(limit);
  }
}

async function readDetailByContentId(ctx: QueryCtx | MutationCtx, contentId: Id<"content">) {
  return await ctx.db
    .query("contentDetails")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .first();
}

export const getHomepageView = query({
  args: {},
  handler: async (ctx): Promise<HomeViewWire> => {
    const row = await ctx.db
      .query("homeViews")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .first();

    return {
      featured: ((row?.featured ?? []) as ContentFeaturedWire[]).map(compactContentFeaturedWire),
      categories: ((row?.rows ?? []) as HomeViewWire["categories"]).map((category) => ({
        ...category,
        content: category.content.map(compactContentCardWire)
      }))
    };
  }
});

export const listNewReleaseCards = query({
  args: {},
  handler: async (ctx): Promise<ContentCardWire[]> => {
    return (await getCatalogPage(ctx, { type: "movie", sortBy: "new", page: 1, limit: 8 })).items;
  }
});

export const getContentDetailById = query({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<ContentDetailWire | null> => {
    const item = await readDetailByContentId(ctx, id);
    return item ? toContentDetailWire(item) : null;
  }
});

export const getContentDetailByTmdbId = query({
  args: { tmdbId: v.string(), type: v.optional(contentTypeValidator) },
  handler: async (ctx, { tmdbId, type }): Promise<ContentDetailWire | null> => {
    const item = type
      ? await ctx.db
          .query("contentDetails")
          .withIndex("by_type_tmdb_id", (q) => q.eq("type", type).eq("tmdbId", tmdbId))
          .first()
      : await ctx.db
          .query("contentDetails")
          .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
          .first();
    return item ? toContentDetailWire(item) : null;
  }
});

export const getContentPlaybackByTmdbId = query({
  args: { tmdbId: v.string(), type: v.optional(contentTypeValidator) },
  handler: async (ctx, { tmdbId, type }): Promise<ContentPlaybackWire | null> => {
    const item = type
      ? await ctx.db
          .query("contentDetails")
          .withIndex("by_type_tmdb_id", (q) => q.eq("type", type).eq("tmdbId", tmdbId))
          .first()
      : await ctx.db
          .query("contentDetails")
          .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
          .first();
    return item ? toContentPlaybackWire(item) : null;
  }
});

export const getBrowseCardsPage = query({
  args: {
    type: contentTypeValidator,
    genre: v.optional(v.string()),
    sortBy: v.optional(browseSortValidator),
    page: v.optional(v.number()),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    return await getCatalogPage(ctx, args);
  }
});

async function upsertContentItem(ctx: MutationCtx, item: ContentInput) {
  const now = Date.now();
  const syncHash = item.syncHash ?? getContentSyncHash(item);
  const tmdbId = contentKey(item);
  const existing = await ctx.db
    .query("content")
    .withIndex("by_type_tmdb_id", (q) => q.eq("type", item.type).eq("tmdbId", tmdbId))
    .first();

  let contentId: Id<"content">;
  const leanContent = toLeanContent(item, syncHash, now);
  if (existing) {
    contentId = existing._id;
    if (existing.syncHash !== syncHash || existing.posterUrl !== leanContent.posterUrl) {
      await ctx.db.patch(existing._id, leanContent);
    }
  } else {
    contentId = await ctx.db.insert("content", leanContent);
  }

  const detail = toDetailContent(contentId, item, syncHash, now);
  const existingDetail = await ctx.db
    .query("contentDetails")
    .withIndex("by_content", (q) => q.eq("contentId", contentId))
    .first();

  if (existingDetail) {
    if (existingDetail.syncHash !== syncHash) {
      await ctx.db.patch(existingDetail._id, detail);
    }
  } else {
    await ctx.db.insert("contentDetails", detail);
  }
}

export const upsertBatchFromTMDB = internalMutation({
  args: { items: v.array(tmdbContentValidator) },
  handler: async (ctx, { items }) => {
    let count = 0;
    for (const item of items) {
      await upsertContentItem(ctx, item);
      count += 1;
    }
    return count;
  }
});

export const getAllTmdbIds = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("content").take(5000);
    return rows.map((row) => ({ tmdbId: row.tmdbId, type: row.type }));
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

export const getContentSyncContextById = query({
  args: { id: v.id("content") },
  handler: async (ctx, { id }) => {
    const item = await ctx.db.get(id);
    if (!item) return null;

    return {
      _id: item._id,
      title: item.title,
      type: item.type,
      tmdbId: item.tmdbId,
      year: item.year
    };
  }
});

export const listRecommendedCardsFromSeed = query({
  args: {
    watchlistIds: v.array(v.id("content")),
    preferredType: contentTypeValidator,
    genres: v.array(v.string()),
    limit: v.optional(v.number()),
    typeFilter: v.optional(v.union(v.literal("all"), v.literal("movie"), v.literal("tv"))),
    refreshSeed: v.optional(v.number())
  },
  handler: async (): Promise<ContentCardWire[]> => {
    return [];
  }
});
