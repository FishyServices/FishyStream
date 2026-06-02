import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toContentCardWire,
  toContentDetailWire,
  toContentFeaturedWire,
  toContentPlaybackWire,
  fromContentTypeWire,
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
  productionCountries: v.optional(v.array(v.string())),
  spokenLanguages: v.optional(v.array(v.string())),
  budget: v.optional(v.number()),
  revenue: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
  syncHash: v.optional(v.string())
});

type BrowseSort = "trending" | "popular" | "new" | "rating" | "year";
type ContentInput = typeof tmdbContentValidator.type;

const DEFAULT_PAGE_LIMIT = 24;
const RECOMMENDATION_POOL_READ_LIMIT = 12;

function normalizePage(page?: number) {
  return Math.max(1, Math.floor(page ?? 1));
}

function normalizeLimit(limit?: number, max = 48) {
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

function seededUnitInterval(seed: string) {
  return Number(hashString(seed)) / 4294967295;
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
    posterUrl: item.posterUrl,
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

function catalogKey(args: {
  type: "movie" | "tv";
  sortBy: BrowseSort;
  genre?: string;
  page: number;
  limit: number;
}) {
  return `browse:${args.type}:${args.sortBy}:${args.genre ? genreKey(args.genre) : "all"}:${args.page}:${args.limit}`;
}

function recommendationPoolKey(type: "movie" | "tv", genre?: string) {
  return `recommend:${type}:${genre ? genreKey(genre) : "all"}`;
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
  const row = await ctx.db
    .query("catalogPages")
    .withIndex("by_key", (q) =>
      q.eq("key", catalogKey({ type: args.type, sortBy, genre: args.genre, page, limit }))
    )
    .first();

  return {
    items: ((row?.items ?? []) as ContentCardWire[]).map(compactContentCardWire),
    hasNextPage: row?.hasNextPage ?? false
  };
}

async function readDetailByContentId(ctx: QueryCtx, contentId: Id<"content">) {
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

export const listPopularCards = query({
  args: {},
  handler: async (ctx): Promise<ContentCardWire[]> => {
    return (await getCatalogPage(ctx, { type: "movie", sortBy: "popular", page: 1, limit: 24 }))
      .items;
  }
});

export const listNewReleaseCards = query({
  args: {},
  handler: async (ctx): Promise<ContentCardWire[]> => {
    return (await getCatalogPage(ctx, { type: "movie", sortBy: "new", page: 1, limit: 24 })).items;
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
  if (existing) {
    contentId = existing._id;
    if (existing.syncHash !== syncHash) {
      await ctx.db.patch(existing._id, toLeanContent(item, syncHash, now));
    }
  } else {
    contentId = await ctx.db.insert("content", toLeanContent(item, syncHash, now));
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

export const getAnimeMissingAniListIds = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 250 }) => {
    const rows = await ctx.db.query("contentDetails").take(5000);

    return rows
      .filter(
        (row) =>
          !row.anilistId &&
          row.type === "tv" &&
          row.originalLanguage?.toLowerCase() === "ja" &&
          row.genre.some((genre) => genre.toLowerCase() === "animation")
      )
      .slice(0, limit)
      .map((row) => ({
        id: row.contentId,
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

export const setAniListId = internalMutation({
  args: { id: v.id("content"), anilistId: v.string() },
  handler: async (ctx, { id, anilistId }) => {
    const detail = await ctx.db
      .query("contentDetails")
      .withIndex("by_content", (q) => q.eq("contentId", id))
      .first();
    if (detail) {
      await ctx.db.patch(detail._id, {
        anilistId,
        updatedAt: Date.now(),
        syncHash: hashPayload({ ...detail, anilistId })
      });
    }
  }
});

async function getRecommendationSeed(ctx: QueryCtx, clerkUserId: string) {
  const watchlistItems = await ctx.db
    .query("watchlist")
    .withIndex("by_clerk_added_at", (q) => q.eq("clerkUserId", clerkUserId))
    .order("desc")
    .take(24);
  if (watchlistItems.length === 0) return null;

  const typeCounts = new Map<"movie" | "tv", number>();
  const genreCounts = new Map<string, number>();

  for (const item of watchlistItems) {
    typeCounts.set(item.contentType, (typeCounts.get(item.contentType) ?? 0) + 1);
    const content = await ctx.db.get(item.contentId);
    for (const genre of content?.genre ?? []) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  return {
    watchlistIds: watchlistItems.map((item) => item.contentId),
    preferredType: Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "movie",
    genres: Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([genre]) => genre)
  };
}

async function readRecommendationPool(ctx: QueryCtx, type: "movie" | "tv", genres: string[]) {
  for (const genre of genres) {
    const row = await ctx.db
      .query("recommendationPools")
      .withIndex("by_key", (q) => q.eq("key", recommendationPoolKey(type, genre)))
      .first();
    if (row?.items.length) {
      return (row.items as ContentCardWire[])
        .slice(0, RECOMMENDATION_POOL_READ_LIMIT)
        .map(compactContentCardWire);
    }
  }

  const row = await ctx.db
    .query("recommendationPools")
    .withIndex("by_key", (q) => q.eq("key", recommendationPoolKey(type)))
    .first();
  return ((row?.items ?? []) as ContentCardWire[])
    .slice(0, RECOMMENDATION_POOL_READ_LIMIT)
    .map(compactContentCardWire);
}

function rankRecommendations(args: {
  pool: ContentCardWire[];
  watchlistIds: Id<"content">[];
  preferredType: "movie" | "tv";
  genres: string[];
  typeFilter: "all" | "movie" | "tv";
  refreshSeed: number;
  limit: number;
}) {
  const watchlistIdSet = new Set(args.watchlistIds);
  const signature = args.watchlistIds.map(String).sort().join("|");

  return args.pool
    .filter((item) => !watchlistIdSet.has(item[0]))
    .filter((item) => args.typeFilter === "all" || fromContentTypeWire(item[2]) === args.typeFilter)
    .map((item) => {
      const itemType = fromContentTypeWire(item[2]);
      let score =
        seededUnitInterval(
          `${signature}:${args.typeFilter}:${args.refreshSeed}:${String(item[0])}`
        ) * 15;
      if (itemType === args.preferredType) score += 2;
      if ((item[5] ?? 0) > 7) score += 0.5;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit)
    .map(({ item }) => item);
}

export const listRecommendedCards = query({
  args: {
    clerkUserId: v.string(),
    limit: v.optional(v.number()),
    typeFilter: v.optional(v.union(v.literal("all"), v.literal("movie"), v.literal("tv"))),
    refreshSeed: v.optional(v.number())
  },
  handler: async (
    ctx,
    { clerkUserId, limit = 12, typeFilter = "all", refreshSeed = 0 }
  ): Promise<ContentCardWire[]> => {
    const seed = await getRecommendationSeed(ctx, clerkUserId);
    if (!seed || seed.watchlistIds.length === 0) return [];

    const poolType = typeFilter === "all" ? seed.preferredType : typeFilter;
    const pool = await readRecommendationPool(ctx, poolType, seed.genres);
    return rankRecommendations({
      pool,
      watchlistIds: seed.watchlistIds,
      preferredType: seed.preferredType,
      genres: seed.genres,
      typeFilter,
      refreshSeed,
      limit
    });
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
  handler: async (
    ctx,
    { watchlistIds, preferredType, genres, limit = 12, typeFilter = "all", refreshSeed = 0 }
  ): Promise<ContentCardWire[]> => {
    if (watchlistIds.length === 0) return [];

    const poolType = typeFilter === "all" ? preferredType : typeFilter;
    const pool = await readRecommendationPool(ctx, poolType, genres);
    return rankRecommendations({
      pool,
      watchlistIds,
      preferredType,
      genres,
      typeFilter,
      refreshSeed,
      limit
    });
  }
});
