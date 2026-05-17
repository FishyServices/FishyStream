import { useQuery, useAction, usePaginatedQuery, useConvex } from "convex/react";
import { useEffect, useState, useRef, useMemo } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ContentMeta } from "../../shared/contentMetadata";

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

export function useHomepageContent() {
  return useQuery(api.content.getHomepageContent);
}

export function usePopularContent() {
  return useQuery(api.content.listPopularContent);
}

export function useNewReleases() {
  return useQuery(api.content.listNewReleaseContent);
}

export function useContentByTmdbId(tmdbId: string | undefined) {
  return useQuery(api.content.getContentByTmdbId, tmdbId ? { tmdbId } : "skip");
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

export type ContentSort = "trending" | "popular" | "new" | "rating" | "year";

export function usePaginatedContent(
  type: "movie" | "tv",
  genre: string | undefined,
  sortBy: ContentSort,
  limit = 24,
  page = 1
): BrowsePageResult {
  const normalizedPage = Math.max(1, Math.floor(page));

  const indexed = usePaginatedQuery(
    api.content.listContentPage,
    genre ? "skip" : { type, sortBy },
    {
      initialNumItems: normalizedPage * limit
    }
  );
  const genrePage = useQuery(
    api.content.listContentPageByGenre,
    genre ? { type, genre, sortBy, page: normalizedPage, limit } : "skip"
  );

  useEffect(() => {
    if (genre) return;
    const requiredItems = normalizedPage * limit;
    if (indexed.results.length >= requiredItems) return;
    if (indexed.status !== "CanLoadMore") return;
    indexed.loadMore(requiredItems - indexed.results.length);
  }, [genre, indexed, limit, normalizedPage]);

  if (genre) {
    return {
      items: genrePage?.items ?? [],
      currentPage: normalizedPage,
      totalPages: genrePage ? Math.ceil(genrePage.totalCount / limit) : undefined,
      totalCount: genrePage?.totalCount,
      hasNextPage: !!genrePage?.nextCursor,
      canGoBack: normalizedPage > 1,
      isLoading: genrePage === undefined,
      goNext: () => {},
      goPrevious: () => {}
    };
  }

  const items = indexed.results;
  const start = (normalizedPage - 1) * limit;
  const visibleItems = items.slice(start, start + limit);
  const hasLoadedNextPage = normalizedPage * limit < items.length;
  const hasNextPage = hasLoadedNextPage || indexed.status === "CanLoadMore";
  const isLoading =
    indexed.status === "LoadingFirstPage" || (normalizedPage > 1 && !visibleItems.length);

  return {
    items: visibleItems,
    currentPage: normalizedPage,
    totalPages: undefined,
    totalCount: undefined,
    hasNextPage,
    canGoBack: normalizedPage > 1,
    isLoading,
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

  const recommendations = useQuery(
    api.content.listRecommendedContent,
    stableWatchlistIds && stableWatchlistIds.length > 0
      ? {
          watchlistIds: stableWatchlistIds,
          limit,
          typeFilter,
          refreshSeed
        }
      : "skip"
  );

  return {
    recommendations: recommendations ?? [],
    isLoading:
      stableWatchlistIds !== undefined && stableWatchlistIds.length > 0
        ? recommendations === undefined
        : false
  };
}
