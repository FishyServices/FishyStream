import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { useState, useEffect, useCallback } from "react";

// ─── TMDB action-based hooks (used in ContentModal) ───────────────────────────

export interface TMDBMediaItem {
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
  type: "movie" | "tv";
}

export function useRelatedContent(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  limit: number = 10,
  enabled: boolean = true
) {
  const [related, setRelated] = useState<TMDBMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const getRelated = useAction(api.tmdb.getRelated);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setRelated([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await getRelated({ tmdbId, type, limit });
        if (!cancelled) setRelated(results as TMDBMediaItem[]);
      } catch {}
      if (!cancelled) setIsLoading(false);
    }, 100);
    return () => {
      clearTimeout(timeout);
      cancelled = true;
    };
  }, [tmdbId, type, limit, enabled, getRelated]);

  return { related, isLoading };
}

export function useContentCredits(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  enabled: boolean = true
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

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setCredits(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await getCredits({ tmdbId, type });
        if (!cancelled) setCredits(results);
      } catch {}
      if (!cancelled) setIsLoading(false);
    }, 150);
    return () => {
      clearTimeout(timeout);
      cancelled = true;
    };
  }, [tmdbId, type, enabled, getCredits]);

  return { credits, isLoading };
}

export function useContentVideos(
  tmdbId: number | undefined,
  type: "movie" | "tv" | undefined,
  enabled: boolean = true
) {
  const [videos, setVideos] = useState<
    Array<{ key: string; name: string; type: string; official: boolean }>
  >([]);
  const [isLoading, setIsLoading] = useState(false);
  const getVideos = useAction(api.tmdb.getVideos);

  useEffect(() => {
    if (!enabled || !tmdbId || !type) {
      setVideos([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await getVideos({ tmdbId, type });
        if (!cancelled) setVideos(results);
      } catch {}
      if (!cancelled) setIsLoading(false);
    }, 200);
    return () => {
      clearTimeout(timeout);
      cancelled = true;
    };
  }, [tmdbId, type, enabled, getVideos]);

  return { videos, isLoading };
}

// ─── Convex DB query hooks ────────────────────────────────────────────────────

export function useFeaturedContent(): Doc<"content"> | null | undefined {
  return useQuery(api.content.getFeatured);
}

export function useTrendingContent(): Doc<"content">[] | undefined {
  return useQuery(api.content.getTrending);
}

export function usePopularContent(): Doc<"content">[] | undefined {
  return useQuery(api.content.getPopular);
}

export function useNewReleases(): Doc<"content">[] | undefined {
  return useQuery(api.content.getNewReleases);
}

export function useMovies(limit?: number): Doc<"content">[] | undefined {
  return useQuery(api.content.getMovies, { limit });
}

export function useTVShows(limit?: number): Doc<"content">[] | undefined {
  return useQuery(api.content.getTVShows, { limit });
}

export function useContentByTmdbId(tmdbId: string | undefined): Doc<"content"> | null | undefined {
  return useQuery(api.content.getByTmdbId, tmdbId ? { tmdbId } : "skip");
}

export function useSearchContent(query: string): Doc<"content">[] | undefined {
  return useQuery(api.content.search, query.trim() ? { query } : "skip");
}

export function useContentByGenre(genre: string, limit?: number): Doc<"content">[] | undefined {
  return useQuery(api.content.getByGenre, genre ? { genre, limit } : "skip");
}

// ─── Combined search (local DB + TMDB) ───────────────────────────────────────

export interface SearchResult {
  tmdbId: number;
  title: string;
  description: string;
  posterUrl: string;
  backdropUrl: string;
  year: number;
  genre: string[];
  rating: string;
  voteAverage?: number;
  seasons?: number;
  imdbId?: string;
  type: "movie" | "tv";
  popularity: number;
}

export function useSearchAll(query: string): {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
} {
  const [results, setResults] = useState<SearchResult[]>([]);
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

    const id = setTimeout(async () => {
      try {
        const [movies, shows] = await Promise.all([
          searchMovies({ query }),
          searchTVShows({ query })
        ]);
        const combined = [
          ...movies.map((m) => ({ ...m, type: "movie" as const })),
          ...shows.map((s) => ({ ...s, type: "tv" as const }))
        ].sort((a, b) => b.popularity - a.popularity);
        setResults(combined);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(id);
  }, [query]);

  return { results, loading, error };
}

// ─── Home page categories ─────────────────────────────────────────────────────

export interface ContentCategory {
  id: string;
  title: string;
  content: Doc<"content">[];
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
