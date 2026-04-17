import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { useState, useEffect } from "react";

export {
  useTMDBData,
  useLazyTMDBData,
  useRelatedContent,
  useContentCredits,
  useContentVideos,
  useIMDbMetadata,
  MOVIE_GENRES,
  TV_GENRES,
  MOVIE_CATEGORIES,
  TV_CATEGORIES,
  type Genre,
  type Category,
  type TMDBMediaItem
} from "./useTMDBData";

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

export function useContentById(id: string | undefined): Doc<"content"> | null | undefined {
  return useQuery(api.content.getById, id ? { id: id as Doc<"content">["_id"] } : "skip");
}

export function useContentByTmdbId(tmdbId: string | undefined): Doc<"content"> | null | undefined {
  return useQuery(api.content.getByTmdbId, tmdbId ? { tmdbId } : "skip");
}

export function useSearchContent(query: string): Doc<"content">[] | undefined {
  return useQuery(api.content.search, query.trim() ? { query } : "skip");
}

export function useSimilarContent(contentId: string | undefined): Doc<"content">[] | undefined {
  return useQuery(
    api.content.getSimilar,
    contentId ? { contentId: contentId as Doc<"content">["_id"], limit: 12 } : "skip"
  );
}

export function useContentByGenre(genre: string, limit?: number): Doc<"content">[] | undefined {
  return useQuery(api.content.getByGenre, genre ? { genre, limit } : "skip");
}

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

  const localResults = useSearchContent(query);

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

    const run = async () => {
      try {
        const [movies, shows] = await Promise.all([
          searchMovies({ query }),
          searchTVShows({ query })
        ]);

        const movieResults: SearchResult[] = movies.map((m) => ({ ...m, type: "movie" as const }));
        const showResults: SearchResult[] = shows.map((s) => ({ ...s, type: "tv" as const }));
        const combined = [...movieResults, ...showResults].sort(
          (a, b) => b.popularity - a.popularity
        );
        setResults(combined);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Search failed");
      } finally {
        setLoading(false);
      }
    };

    const id = setTimeout(run, 350);
    return () => clearTimeout(id);
  }, [query]);

  return { results, loading, error };
}

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
