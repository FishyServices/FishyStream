import { useQuery, useAction } from "convex/react";
import { useEffect, useState, useRef, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ContentDetail, ContentMeta, FeaturedContentMeta } from "../../shared/contentMetadata";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";

export interface BrowsePageResult {
  items: ContentMeta[];
  currentPage: number;
  totalPages?: number;
  totalCount?: number;
  hasNextPage: boolean;
  canGoBack: boolean;
  isLoading: boolean;
  goNext: () => void;
  goPrevious: () => void;
}

export interface TMDBItem {
  tmdbId: number;
  title: string;
  posterUrl: string;
  year: number;
  genre?: string[];
  rating?: string;
  voteAverage?: number;
  type: "movie" | "tv";
}

export function useHomepageContent() {
  return useOneShotConvexQuery<{
    featured: FeaturedContentMeta | null;
    categories: Array<{ id: string; title: string; content: ContentMeta[] }>;
  }>(true, (convex) => convex.query(api.content.getHomepageContent, {}), []);
}

export function usePopularContent() {
  return useOneShotConvexQuery<ContentMeta[]>(
    true,
    (convex) => convex.query(api.content.listPopularContent, {}),
    []
  );
}

export function useNewReleases() {
  return useOneShotConvexQuery<ContentMeta[]>(
    true,
    (convex) => convex.query(api.content.listNewReleaseContent, {}),
    []
  );
}

export function useContentByTmdbId(tmdbId: string | undefined) {
  return useOneShotConvexQuery<ContentDetail | null>(
    !!tmdbId,
    (convex) => convex.query(api.content.getContentByTmdbId, { tmdbId: tmdbId! }),
    [tmdbId]
  );
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
        const [movies, shows] = (await Promise.all([
          searchMovies({ query }),
          searchTVShows({ query })
        ])) as [TMDBItem[], TMDBItem[]];
        const combined = [
          ...movies.map((m) => ({ ...m, type: "movie" as const })),
          ...shows.map((s) => ({ ...s, type: "tv" as const }))
        ];
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

export type ContentSort = "trending" | "popular" | "new" | "rating" | "year";

export function usePaginatedContent(
  type: "movie" | "tv",
  genre: string | undefined,
  sortBy: ContentSort,
  limit = 24,
  page = 1
): BrowsePageResult {
  const normalizedPage = Math.max(1, Math.floor(page));
  const pageData = useOneShotConvexQuery<{
    items: ContentMeta[];
    currentPage: number;
    totalPages?: number;
    totalCount?: number;
    hasNextPage: boolean;
  }>(
    true,
    (convex) =>
      convex.query(api.content.getBrowsePage, {
        type,
        genre,
        sortBy,
        page: normalizedPage,
        limit
      }),
    [type, genre, sortBy, normalizedPage, limit]
  );

  return {
    items: pageData?.items ?? [],
    currentPage: normalizedPage,
    totalPages: pageData?.totalPages,
    totalCount: pageData?.totalCount,
    hasNextPage: pageData?.hasNextPage ?? false,
    canGoBack: normalizedPage > 1,
    isLoading: pageData === undefined,
    goNext: () => {},
    goPrevious: () => {}
  };
}

export function useRecommendations(
  watchlistIds: Id<"content">[] | undefined,
  limit = 12,
  typeFilter: "all" | "movie" | "tv" = "all",
  refreshSeed = 0
) {
  const stableWatchlistIds = useMemo(
    () => (watchlistIds ? [...watchlistIds].sort() : undefined),
    [watchlistIds]
  );

  const recommendations = useOneShotConvexQuery<ContentMeta[]>(
    !!stableWatchlistIds && stableWatchlistIds.length > 0,
    (convex) =>
      convex.query(api.content.listRecommendedContent, {
        watchlistIds: stableWatchlistIds!,
        limit,
        typeFilter,
        refreshSeed
      }),
    [stableWatchlistIds, limit, typeFilter, refreshSeed]
  );

  return {
    recommendations: recommendations ?? [],
    isLoading:
      stableWatchlistIds !== undefined && stableWatchlistIds.length > 0
        ? recommendations === undefined
        : false
  };
}
