import { useAction } from "convex/react";
import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/react";
import { api } from "../../convex/_generated/api";
import type {
  ContentCard,
  ContentDetail,
  ContentFeatured,
  ContentPlayback
} from "../../shared/contentMetadata";
import type { Id } from "../../convex/_generated/dataModel";
import { useOneShotConvexQuery } from "./useOneShotConvexQuery";

export interface BrowsePageResult {
  items: ContentCard[];
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
    featured: ContentFeatured[];
    categories: Array<{ id: string; title: string; content: ContentCard[] }>;
  }>(true, (convex) => convex.query(api.content.getHomepageView, {}), []);
}

export function usePopularContent() {
  return useOneShotConvexQuery<ContentCard[]>(
    true,
    (convex) => convex.query(api.content.listPopularCards, {}),
    []
  );
}

export function useNewReleases() {
  return useOneShotConvexQuery<ContentCard[]>(
    true,
    (convex) => convex.query(api.content.listNewReleaseCards, {}),
    []
  );
}

export function useContentPlaybackByTmdbId(tmdbId: string | undefined) {
  return useOneShotConvexQuery<ContentPlayback | null>(
    !!tmdbId,
    (convex) => convex.query(api.content.getContentPlaybackByTmdbId, { tmdbId: tmdbId! }),
    [tmdbId]
  );
}

export function useContentDetailByTmdbId(tmdbId: string | undefined) {
  return useOneShotConvexQuery<ContentDetail | null>(
    !!tmdbId,
    (convex) => convex.query(api.content.getContentDetailByTmdbId, { tmdbId: tmdbId! }),
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
    items: ContentCard[];
    totalPages?: number;
    totalCount?: number;
    hasNextPage: boolean;
  }>(
    true,
    (convex) =>
      convex.query(api.content.getBrowseCardsPage, {
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
  limit = 12,
  typeFilter: "all" | "movie" | "tv" = "all",
  refreshSeed = 0,
  enabled = true,
  seed?: {
    watchlistIds: Id<"content">[];
    preferredType: "movie" | "tv";
    genres: string[];
  }
) {
  const { user } = useUser();

  const recommendations = useOneShotConvexQuery<ContentCard[]>(
    enabled && (!!user || !!seed),
    (convex) =>
      seed
        ? convex.query(api.content.listRecommendedCardsFromSeed, {
            watchlistIds: seed.watchlistIds,
            preferredType: seed.preferredType,
            genres: seed.genres,
            limit,
            typeFilter,
            refreshSeed
          })
        : convex.query(api.content.listRecommendedCards, {
            clerkUserId: user!.id,
            limit,
            typeFilter,
            refreshSeed
          }),
    [
      user?.id,
      limit,
      typeFilter,
      refreshSeed,
      seed?.preferredType,
      seed?.watchlistIds.join("|"),
      seed?.genres.join("|")
    ]
  );

  return {
    recommendations: recommendations ?? [],
    isLoading: enabled && (!!user || !!seed) ? recommendations === undefined : false
  };
}
