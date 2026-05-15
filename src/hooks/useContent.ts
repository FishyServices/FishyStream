import { useQuery, useAction } from "convex/react";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";

export type ContentListItem = Pick<
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

export interface PaginatedResult {
  items: ContentListItem[];
  nextCursor?: string;
  totalCount: number;
}

export interface TMDBItem {
  tmdbId: number;
  title: string;
  description: string;
  posterUrl: string;
  backdropUrl: string;
  year: number;
  genre: string[];
  rating: string;
  voteAverage?: number;
  popularity?: number;
  seasons?: number;
  imdbId?: string;
  type: "movie" | "tv";
}

export function useFeaturedContent() {
  return useQuery(api.content.getFeatured);
}

export function useHomepageContent() {
  return useQuery(api.content.getHomepage);
}

export function useTrendingContent() {
  return useQuery(api.content.getTrending);
}

export function usePopularContent() {
  return useQuery(api.content.getPopular);
}

export function useNewReleases() {
  return useQuery(api.content.getNewReleases);
}

export function useMovies(limit?: number) {
  return useQuery(api.content.getMovies, { limit });
}

export function useTVShows(limit?: number) {
  return useQuery(api.content.getTVShows, { limit });
}

export function useContentByTmdbId(tmdbId: string | undefined) {
  return useQuery(api.content.getByTmdbId, tmdbId ? { tmdbId } : "skip");
}

export function useContentById(id: Id<"content"> | undefined) {
  return useQuery(api.content.getById, id ? { id } : "skip");
}

export function useContentByGenre(genre: string, limit?: number) {
  return useQuery(api.content.getByGenre, genre ? { genre, limit } : "skip");
}

export function useRelatedContent(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  limit = 10,
  enabled = true
) {
  const [related, setRelated] = useState<TMDBItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const getRelated = useAction(api.tmdb.getRelated);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setRelated([]);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await getRelated({ tmdbId, type, limit });
        if (!cancelRef.current) setRelated(res as TMDBItem[]);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 100);
    return () => {
      clearTimeout(t);
      cancelRef.current = true;
    };
  }, [tmdbId, type, limit, enabled]);

  return { related, isLoading };
}

export function useContentCredits(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  enabled = true
) {
  const [credits, setCredits] = useState<{
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profileUrl?: string;
      order: number;
    }>;
    directors: string[];
    writers: string[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const getCredits = useAction(api.tmdb.getCredits);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setCredits(null);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await getCredits({ tmdbId, type });
        if (!cancelRef.current) setCredits(res);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 150);
    return () => {
      clearTimeout(t);
      cancelRef.current = true;
    };
  }, [tmdbId, type, enabled]);

  return { credits, isLoading };
}

export function useContentVideos(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  enabled = true
) {
  const [videos, setVideos] = useState<
    Array<{ key: string; name: string; type: string; official: boolean }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const getVideos = useAction(api.tmdb.getVideos);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setVideos([]);
      return;
    }
    cancelRef.current = false;
    setIsLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await getVideos({ tmdbId, type });
        if (!cancelRef.current) setVideos(res);
      } catch {}
      if (!cancelRef.current) setIsLoading(false);
    }, 200);
    return () => {
      clearTimeout(t);
      cancelRef.current = true;
    };
  }, [tmdbId, type, enabled]);

  return { videos, isLoading };
}

export function useSearchAll(query: string) {
  const [results, setResults] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchMovies = useAction(api.tmdb.searchMovies);
  const searchTVShows = useAction(api.tmdb.searchTVShows);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);

    const t = setTimeout(async () => {
      try {
        const [movies, shows] = await Promise.all([
          searchMovies({ query }),
          searchTVShows({ query })
        ]);
        const combined = [
          ...movies.map((m) => ({ ...m, type: "movie" as const })),
          ...shows.map((s) => ({ ...s, type: "tv" as const }))
        ].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
        setResults(combined as TMDBItem[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [query]);

  return { results, loading, error };
}

export interface ContentCategory {
  id: string;
  title: string;
  content: ContentListItem[];
}

export type ContentSort = "trending" | "popular" | "new" | "rating" | "year";

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

export function useAllCategories(): ContentCategory[] {
  const trending = useTrendingContent() ?? [];
  const popular = usePopularContent() ?? [];
  const newReleases = useNewReleases() ?? [];
  const movies = useMovies(24) ?? [];
  const tvShows = useTVShows(24) ?? [];

  return [
    { id: "trending", title: "Trending Now 🔥", content: trending },
    { id: "popular", title: "Popular on FishyStream", content: popular },
    { id: "new", title: "New Releases", content: newReleases },
    { id: "movies", title: "Movies", content: movies },
    { id: "tvshows", title: "TV Shows", content: tvShows }
  ].filter((c) => c.content.length > 0);
}

export function usePaginatedContent(
  type: "movie" | "tv" | undefined,
  genre: string | undefined,
  sortBy: ContentSort,
  cursor: string | undefined,
  limit = 24
) {
  return useQuery(api.content.getPaginated, { type, genre, sortBy, cursor, limit });
}

export function useRecommendations(
  watchlistItems: ContentListItem[] | undefined,
  limit = 12,
  typeFilter: "all" | "movie" | "tv" = "all",
  refreshSeed = 0
) {
  const allContent = useQuery(
    api.content.getAll,
    watchlistItems && watchlistItems.length > 0 ? undefined : "skip"
  );

  const recommendations = useMemo(() => {
    if (!watchlistItems || !allContent || watchlistItems.length === 0) {
      return [];
    }

    const watchlistGenres = new Map<string, number>();
    const watchlistTypes = new Map<string, number>();

    for (const item of watchlistItems) {
      watchlistTypes.set(item.type, (watchlistTypes.get(item.type) || 0) + 1);
      for (const g of item.genre) {
        watchlistGenres.set(g, (watchlistGenres.get(g) || 0) + 1);
      }
    }

    const preferredType =
      Array.from(watchlistTypes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || "movie";

    const watchlistIds = new Set(watchlistItems.map((w) => w._id));
    let filtered = allContent.filter((c: ContentListItem) => !watchlistIds.has(c._id));

    if (typeFilter !== "all") {
      filtered = filtered.filter((c: ContentListItem) => c.type === typeFilter);
    }

    const watchlistSignature = watchlistItems
      .map((item) => item._id)
      .sort()
      .join("|");
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
      .map((c: ContentListItem) => {
        let score = 0;
        score +=
          seededUnitInterval(
            `${watchlistSignature}:${typeFilter}:${refreshSeed}:score:${String(c._id)}`
          ) * 15;
        if (c.type === preferredType) score += 2;
        for (const g of c.genre) {
          const genreScore = watchlistGenres.get(g) || 0;
          score += genreScore * 1.5;
        }
        if (c.popular) score += 1;
        if (c.voteAverage && c.voteAverage > 7) score += 0.5;
        return { content: c, score };
      })
      .sort(
        (
          a: { content: ContentListItem; score: number },
          b: { content: ContentListItem; score: number }
        ) => b.score - a.score
      )
      .slice(0, limit)
      .map((s: { content: ContentListItem; score: number }) => s.content);
  }, [watchlistItems, allContent, limit, typeFilter, refreshSeed]);

  const isLoading =
    watchlistItems !== undefined && watchlistItems.length > 0 && allContent === undefined;

  return { recommendations, isLoading };
}

export function useAllContent() {
  return useQuery(api.content.getAll);
}
