import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  toContentCard,
  toContentCardRow,
  toContentDetail,
  toContentFeatured,
  toContentPlayback,
  type ContentDetail,
  type ContentCard,
  type ContentFeatured,
  type ContentPlayback
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
): Promise<ContentCard[]> {
  let cardRows;
  switch (sortBy) {
    case "trending":
      cardRows = await ctx.db
        .query("contentCards")
        .withIndex("by_type_trending", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
      break;
    case "new":
      cardRows = await ctx.db
        .query("contentCards")
        .withIndex("by_type_new", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
      break;
    case "rating":
      cardRows = await ctx.db
        .query("contentCards")
        .withIndex("by_type_vote_average", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
      break;
    case "year":
      cardRows = await ctx.db
        .query("contentCards")
        .withIndex("by_type_year", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
      break;
    default:
      cardRows = await ctx.db
        .query("contentCards")
        .withIndex("by_type_popular", (q) => q.eq("type", type))
        .order("desc")
        .take(takeCount);
      break;
  }

  if (cardRows.length > 0) {
    return cardRows.map(toContentCardRow);
  }

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

  return items.map(toContentCard);
}

async function readFlaggedCards(
  ctx: QueryCtx,
  flag: "trending" | "popular" | "new",
  takeCount: number
): Promise<ContentCard[]> {
  const cardRows = await ctx.db
    .query("contentCards")
    .withIndex(`by_${flag}` as "by_trending" | "by_popular" | "by_new", (q) => q.eq(flag, true))
    .take(takeCount);

  if (cardRows.length > 0) {
    return cardRows.map(toContentCardRow);
  }

  const items = await ctx.db
    .query("content")
    .withIndex(`by_${flag}` as "by_trending" | "by_popular" | "by_new", (q) => q.eq(flag, true))
    .take(takeCount);

  return items.map(toContentCard);
}

async function readTypeCards(ctx: QueryCtx, type: "movie" | "tv", takeCount: number) {
  const cardRows = await ctx.db
    .query("contentCards")
    .withIndex("by_type", (q) => q.eq("type", type))
    .take(takeCount);

  if (cardRows.length > 0) {
    return cardRows.map(toContentCardRow);
  }

  const items = await ctx.db
    .query("content")
    .withIndex("by_type", (q) => q.eq("type", type))
    .take(takeCount);

  return items.map(toContentCard);
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
  const start = (page - 1) * limit;

  if (genre) {
    let requested = Math.max(limit * 2, page * limit + 1);
    let filtered: ContentCard[] = [];
    let exhausted = false;

    while (!exhausted && filtered.length <= start + limit) {
      const batch = await readSortedContent(ctx, args.type, sortBy, requested);
      filtered = batch.filter((item) => item.genre.some((value) => lower(value) === genre));
      exhausted = batch.length < requested;
      requested = Math.min(requested * 2, 5000);
      if (requested === 5000 && batch.length === 5000) {
        break;
      }
    }

    return {
      items: filtered.slice(start, start + limit),
      hasNextPage: filtered.length > start + limit
    };
  }

  const items = await readSortedContent(ctx, args.type, sortBy, page * limit + 1);
  const pageItems = items.slice(start, start + limit);
  const hasNextPage = items.length > page * limit;

  return {
    items: pageItems,
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

export const getHomepageView = query({
  args: {},
  handler: async (
    ctx
  ): Promise<{
    featured: ContentFeatured[];
    categories: Array<{ id: string; title: string; content: ContentCard[] }>;
  }> => {
    let featuredDocs = await ctx.db
      .query("content")
      .withIndex("by_featured", (q) => q.eq("featured", true))
      .take(5);

    if (featuredDocs.length < 5) {
      const extraDocs = await ctx.db
        .query("content")
        .withIndex("by_trending", (q) => q.eq("trending", true))
        .take(10);

      const existingIds = new Set(featuredDocs.map((doc) => doc._id));
      for (const doc of extraDocs) {
        if (!existingIds.has(doc._id)) {
          featuredDocs.push(doc);
          existingIds.add(doc._id);
        }
        if (featuredDocs.length >= 5) {
          break;
        }
      }
    }

    const [trending, popular, newReleases, movies, tvShows] = await Promise.all([
      readFlaggedCards(ctx, "trending", HOMEPAGE_ROW_LIMIT),
      readFlaggedCards(ctx, "popular", HOMEPAGE_ROW_LIMIT),
      readFlaggedCards(ctx, "new", HOMEPAGE_ROW_LIMIT),
      readTypeCards(ctx, "movie", HOMEPAGE_ROW_LIMIT),
      readTypeCards(ctx, "tv", HOMEPAGE_ROW_LIMIT)
    ]);

    return {
      featured: featuredDocs.map(toContentFeatured),
      categories: [
        { id: "trending", title: "Trending Now 🔥", content: trending },
        { id: "popular", title: "Popular on FishyStream", content: popular },
        { id: "new", title: "New Releases", content: newReleases },
        { id: "movies", title: "Movies", content: movies },
        { id: "tvshows", title: "TV Shows", content: tvShows }
      ].filter((row) => row.content.length > 0)
    };
  }
});

export const listPopularCards = query({
  args: {},
  handler: async (ctx): Promise<ContentCard[]> => {
    return await readFlaggedCards(ctx, "popular", 24);
  }
});

export const listNewReleaseCards = query({
  args: {},
  handler: async (ctx): Promise<ContentCard[]> => {
    return await readFlaggedCards(ctx, "new", 24);
  }
});

export const getContentDetailById = query({
  args: { id: v.id("content") },
  handler: async (ctx, { id }): Promise<ContentDetail | null> => {
    const item = await ctx.db.get(id);
    return item ? toContentDetail(item) : null;
  }
});

export const getContentDetailByTmdbId = query({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }): Promise<ContentDetail | null> => {
    const item = await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();
    return item ? toContentDetail(item) : null;
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
        const existingCard = await ctx.db
          .query("contentCards")
          .withIndex("by_content", (q) => q.eq("contentId", existing._id))
          .first();
        const card = {
          contentId: existing._id,
          title: item.title,
          type: item.type,
          genre: item.genre.slice(0, 3),
          year: item.year,
          rating: item.rating,
          voteAverage: item.voteAverage,
          posterUrl: item.posterUrl,
          tmdbId: item.tmdbId,
          new: item.new,
          trending: item.trending,
          popular: item.popular,
          featured: item.featured,
          createdAt: existing.createdAt,
          updatedAt: Date.now()
        };
        if (existingCard) {
          await ctx.db.patch(existingCard._id, card);
        } else {
          await ctx.db.insert("contentCards", card);
        }
      } else {
        const contentId = await ctx.db.insert("content", item);
        await ctx.db.insert("contentCards", {
          contentId,
          title: item.title,
          type: item.type,
          genre: item.genre.slice(0, 3),
          year: item.year,
          rating: item.rating,
          voteAverage: item.voteAverage,
          posterUrl: item.posterUrl,
          tmdbId: item.tmdbId,
          new: item.new,
          trending: item.trending,
          popular: item.popular,
          featured: item.featured,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        });
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

export const rebuildContentCards = internalMutation({
  args: {
    contentId: v.optional(v.id("content")),
    limit: v.optional(v.number())
  },
  handler: async (ctx, { contentId, limit = 1000 }) => {
    const rows = contentId
      ? (await ctx.db.get(contentId))
        ? [await ctx.db.get(contentId)]
        : []
      : await ctx.db.query("content").take(limit);

    let updated = 0;
    for (const row of rows) {
      if (!row) continue;

      const existingCard = await ctx.db
        .query("contentCards")
        .withIndex("by_content", (q) => q.eq("contentId", row._id))
        .first();

      const card = {
        contentId: row._id,
        title: row.title,
        type: row.type,
        genre: row.genre.slice(0, 3),
        year: row.year,
        rating: row.rating,
        voteAverage: row.voteAverage,
        posterUrl: row.posterUrl,
        tmdbId: row.tmdbId,
        new: row.new,
        trending: row.trending,
        popular: row.popular,
        featured: row.featured,
        createdAt: row.createdAt,
        updatedAt: Date.now()
      };

      if (existingCard) {
        await ctx.db.patch(existingCard._id, card);
      } else {
        await ctx.db.insert("contentCards", card);
      }
      updated += 1;
    }

    return updated;
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

export const getContentPlaybackByTmdbId = query({
  args: { tmdbId: v.string() },
  handler: async (ctx, { tmdbId }): Promise<ContentPlayback | null> => {
    const item = await ctx.db
      .query("content")
      .withIndex("by_tmdb_id", (q) => q.eq("tmdbId", tmdbId))
      .first();
    return item ? toContentPlayback(item) : null;
  }
});

async function getRecommendationSeed(ctx: QueryCtx, clerkUserId: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
  if (!user) return null;

  const items = await ctx.db
    .query("watchlist")
    .withIndex("by_user_added_at", (q) => q.eq("userId", user._id))
    .order("desc")
    .take(24);

  if (items.length === 0) {
    return { watchlistIds: [] as Id<"content">[], preferredType: "movie" as const, genres: [] };
  }

  const watchlistIds = items.map((item) => item.contentId);
  const watchlistTypes = new Map<"movie" | "tv", number>();
  const watchlistGenres = new Map<string, number>();

  for (const item of items) {
    const type = item.contentType;
    if (type) {
      watchlistTypes.set(type, (watchlistTypes.get(type) || 0) + 1);
    }
    for (const genre of item.genre ?? []) {
      watchlistGenres.set(genre, (watchlistGenres.get(genre) || 0) + 1);
    }
  }

  const preferredType =
    Array.from(watchlistTypes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "movie";
  const genres = Array.from(watchlistGenres.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre]) => genre);

  return { watchlistIds, preferredType, genres };
}

export const setAniListId = internalMutation({
  args: { id: v.id("content"), anilistId: v.string() },
  handler: async (ctx, { id, anilistId }) => {
    await ctx.db.patch(id, { anilistId, updatedAt: Date.now() });
  }
});

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
  ): Promise<ContentCard[]> => {
    const seed = await getRecommendationSeed(ctx, clerkUserId);
    if (!seed || seed.watchlistIds.length === 0) return [];

    const watchlistIdSet = new Set<Id<"content">>(seed.watchlistIds);
    const watchlistSignature = seed.watchlistIds
      .map((item: Id<"content">) => String(item))
      .sort()
      .join("|");
    const candidateFetchLimit = Math.max(limit * 2, 24);
    const preferredType = seed.preferredType;
    const preferredGenres = new Set(seed.genres);

    const cardCandidates =
      typeFilter === "all"
        ? await ctx.db
            .query("contentCards")
            .withIndex("by_type", (q) => q.eq("type", preferredType as "movie" | "tv"))
            .take(candidateFetchLimit)
        : await ctx.db
            .query("contentCards")
            .withIndex("by_type", (q) => q.eq("type", typeFilter))
            .take(candidateFetchLimit);

    if (cardCandidates.length === 0) {
      const contentCandidates =
        typeFilter === "all"
          ? await ctx.db
              .query("content")
              .withIndex("by_type", (q) => q.eq("type", preferredType as "movie" | "tv"))
              .take(candidateFetchLimit)
          : await ctx.db
              .query("content")
              .withIndex("by_type", (q) => q.eq("type", typeFilter))
              .take(candidateFetchLimit);

      return [...contentCandidates]
        .filter((item) => !watchlistIdSet.has(item._id))
        .map((item) => {
          let score = 0;
          score +=
            seededUnitInterval(
              `${watchlistSignature}:${typeFilter}:${refreshSeed}:score:${String(item._id)}`
            ) * 15;
          if (item.type === preferredType) score += 2;
          for (const genre of item.genre) {
            if (preferredGenres.has(genre)) score += 1.5;
          }
          if (item.popular) score += 1;
          if (item.voteAverage && item.voteAverage > 7) score += 0.5;
          return { item, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ item }) => toContentCard(item));
    }

    const filtered = cardCandidates.filter((item) => !watchlistIdSet.has(item.contentId));
    const poolSize = Math.min(filtered.length, limit * 2 + refreshSeed * 4);
    const pool = [...filtered]
      .sort((a, b) => {
        const aSeed = seededUnitInterval(
          `${watchlistSignature}:${typeFilter}:${refreshSeed}:${String(a.contentId)}`
        );
        const bSeed = seededUnitInterval(
          `${watchlistSignature}:${typeFilter}:${refreshSeed}:${String(b.contentId)}`
        );
        return aSeed - bSeed;
      })
      .slice(0, poolSize);

    return pool
      .map((item) => {
        let score = 0;
        score +=
          seededUnitInterval(
            `${watchlistSignature}:${typeFilter}:${refreshSeed}:score:${String(item.contentId)}`
          ) * 15;
        if (item.type === preferredType) score += 2;
        for (const genre of item.genre) {
          if (preferredGenres.has(genre)) score += 1.5;
        }
        if (item.popular) score += 1;
        if (item.voteAverage && item.voteAverage > 7) score += 0.5;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => toContentCardRow(item));
  }
});
