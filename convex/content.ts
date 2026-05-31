import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  toContentCardWire,
  toContentDetailWire,
  toContentFeaturedWire,
  toContentPlaybackWire,
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

const HOMEPAGE_ROW_LIMIT = 10;
const DEFAULT_PAGE_LIMIT = 24;
const MATERIALIZED_PAGE_COUNT = 12;
const RECOMMENDATION_POOL_LIMIT = 64;

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
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    logoUrl: item.logoUrl,
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
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    description: item.description,
    rating: item.rating,
    logoUrl: item.logoUrl,
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

function sortContentRows(rows: Doc<"content">[], sortBy: BrowseSort) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const keyDelta = b.sortKeys[sortBy] - a.sortKeys[sortBy];
    if (keyDelta !== 0) return keyDelta;
    return b.updatedAt - a.updatedAt;
  });
  return sorted;
}

async function upsertByKey<
  TableName extends "catalogPages" | "homeViews" | "recommendationPools" | "syncRuns"
>(
  ctx: MutationCtx,
  table: TableName,
  key: string,
  value: Omit<Doc<TableName>, "_id" | "_creationTime">
) {
  const existing = await ctx.db
    .query(table)
    .withIndex("by_key", (q) => q.eq("key", key as any))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, value as any);
    return existing._id;
  }
  return await ctx.db.insert(table, value as any);
}

async function clearMaterializedViews(ctx: MutationCtx) {
  const [pages, homes, pools] = await Promise.all([
    ctx.db.query("catalogPages").collect(),
    ctx.db.query("homeViews").collect(),
    ctx.db.query("recommendationPools").collect()
  ]);

  for (const row of [...pages, ...homes, ...pools]) {
    await ctx.db.delete(row._id);
  }
}

async function rebuildMaterializedViews(ctx: MutationCtx) {
  const now = Date.now();
  const rows = await ctx.db.query("content").take(5000);
  const sourceHash = hashPayload(rows.map((row) => [row._id, row.syncHash, row.updatedAt]));

  await clearMaterializedViews(ctx);

  const detailsByContentId = new Map<string, Doc<"contentDetails">>();
  for (const detail of await ctx.db.query("contentDetails").take(5000)) {
    detailsByContentId.set(String(detail.contentId), detail);
  }

  const featuredDetails = rows
    .filter((row) => row.featured)
    .sort((a, b) => b.sortKeys.trending - a.sortKeys.trending)
    .slice(0, 3)
    .map((row) => detailsByContentId.get(String(row._id)))
    .filter((row): row is Doc<"contentDetails"> => !!row);

  const fallbackFeatured = rows
    .filter((row) => row.trending)
    .sort((a, b) => b.sortKeys.trending - a.sortKeys.trending)
    .map((row) => detailsByContentId.get(String(row._id)))
    .filter((row): row is Doc<"contentDetails"> => !!row);

  const seenFeatured = new Set(featuredDetails.map((row) => row.contentId));
  for (const row of fallbackFeatured) {
    if (seenFeatured.has(row.contentId)) continue;
    featuredDetails.push(row);
    seenFeatured.add(row.contentId);
    if (featuredDetails.length >= 3) break;
  }

  const trending = sortContentRows(
    rows.filter((row) => row.trending),
    "trending"
  )
    .slice(0, HOMEPAGE_ROW_LIMIT)
    .map(toContentCardWire);
  const movies = sortContentRows(
    rows.filter((row) => row.type === "movie"),
    "popular"
  )
    .slice(0, HOMEPAGE_ROW_LIMIT)
    .map(toContentCardWire);
  const tvShows = sortContentRows(
    rows.filter((row) => row.type === "tv"),
    "popular"
  )
    .slice(0, HOMEPAGE_ROW_LIMIT)
    .map(toContentCardWire);

  await upsertByKey(ctx, "homeViews", "default", {
    key: "default",
    featured: featuredDetails.slice(0, 3).map(toContentFeaturedWire),
    rows: [
      { id: "trending", title: "Trending Now", content: trending },
      { id: "movies", title: "Movies", content: movies },
      { id: "tvshows", title: "TV Shows", content: tvShows }
    ].filter((row) => row.content.length > 0),
    updatedAt: now,
    sourceHash
  });

  const types = ["movie", "tv"] as const;
  const sorts = ["popular", "trending", "new", "rating", "year"] as const;

  for (const type of types) {
    const typeRows = rows.filter((row) => row.type === type);
    const typeGenres = Array.from(new Set(typeRows.flatMap((row) => row.genreKeys)));

    for (const sortBy of sorts) {
      const sorted = sortContentRows(typeRows, sortBy);
      await materializePages(ctx, {
        type,
        sortBy,
        rows: sorted,
        genre: undefined,
        now,
        sourceHash
      });

      for (const key of typeGenres) {
        await materializePages(ctx, {
          type,
          sortBy,
          rows: sorted.filter((row) => row.genreKeys.includes(key)),
          genre: key,
          now,
          sourceHash
        });
      }
    }

    await upsertByKey(ctx, "recommendationPools", recommendationPoolKey(type), {
      key: recommendationPoolKey(type),
      type,
      genreKey: undefined,
      items: sortContentRows(typeRows, "popular")
        .slice(0, RECOMMENDATION_POOL_LIMIT)
        .map(toContentCardWire),
      updatedAt: now,
      sourceHash
    });

    for (const key of typeGenres) {
      await upsertByKey(ctx, "recommendationPools", recommendationPoolKey(type, key), {
        key: recommendationPoolKey(type, key),
        type,
        genreKey: key,
        items: sortContentRows(
          typeRows.filter((row) => row.genreKeys.includes(key)),
          "popular"
        )
          .slice(0, RECOMMENDATION_POOL_LIMIT)
          .map(toContentCardWire),
        updatedAt: now,
        sourceHash
      });
    }
  }

  await upsertByKey(ctx, "syncRuns", "materializedViews", {
    key: "materializedViews",
    status: "complete",
    startedAt: now,
    finishedAt: Date.now(),
    stats: { contentRows: rows.length }
  });
}

async function materializePages(
  ctx: MutationCtx,
  args: {
    type: "movie" | "tv";
    sortBy: BrowseSort;
    rows: Doc<"content">[];
    genre?: string;
    now: number;
    sourceHash: string;
  }
) {
  for (let page = 1; page <= MATERIALIZED_PAGE_COUNT; page += 1) {
    const start = (page - 1) * DEFAULT_PAGE_LIMIT;
    const pageRows = args.rows.slice(start, start + DEFAULT_PAGE_LIMIT);
    if (pageRows.length === 0 && page > 1) break;

    const key = catalogKey({
      type: args.type,
      sortBy: args.sortBy,
      genre: args.genre,
      page,
      limit: DEFAULT_PAGE_LIMIT
    });

    await upsertByKey(ctx, "catalogPages", key, {
      key,
      type: args.type,
      sortBy: args.sortBy,
      genreKey: args.genre,
      page,
      limit: DEFAULT_PAGE_LIMIT,
      items: pageRows.map(toContentCardWire),
      hasNextPage: args.rows.length > start + DEFAULT_PAGE_LIMIT,
      updatedAt: args.now,
      sourceHash: args.sourceHash
    });
  }
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
    items: (row?.items ?? []) as ContentCardWire[],
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
      featured: (row?.featured ?? []) as ContentFeaturedWire[],
      categories: (row?.rows ?? []) as HomeViewWire["categories"]
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
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
  if (!user) return null;

  return {
    watchlistIds: user.watchlistContentIds,
    preferredType: user.watchlistRecommendationType ?? "movie",
    genres: user.watchlistRecommendationGenres
  };
}

async function readRecommendationPool(ctx: QueryCtx, type: "movie" | "tv", genres: string[]) {
  for (const genre of genres) {
    const row = await ctx.db
      .query("recommendationPools")
      .withIndex("by_key", (q) => q.eq("key", recommendationPoolKey(type, genre)))
      .first();
    if (row?.items.length) return row.items as ContentCardWire[];
  }

  const row = await ctx.db
    .query("recommendationPools")
    .withIndex("by_key", (q) => q.eq("key", recommendationPoolKey(type)))
    .first();
  return (row?.items ?? []) as ContentCardWire[];
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
  const preferredGenres = new Set(args.genres.slice(0, 8));
  const signature = args.watchlistIds.map(String).sort().join("|");

  return args.pool
    .filter((item) => !watchlistIdSet.has(item[0]))
    .filter((item) => args.typeFilter === "all" || item[2] === args.typeFilter)
    .map((item) => {
      let score =
        seededUnitInterval(
          `${signature}:${args.typeFilter}:${args.refreshSeed}:${String(item[0])}`
        ) * 15;
      if (item[2] === args.preferredType) score += 2;
      for (const genre of item[8] ?? []) {
        if (preferredGenres.has(genre)) score += 1.5;
      }
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
