import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";

type MediaType = "movie" | "tv";

export interface Genre {
  id: number;
  name: string;
}

export interface Category {
  id: string;
  name: string;
  endpoint: string;
}

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
  type: MediaType;
}

export const MOVIE_GENRES: Genre[] = [
  { id: 28, name: "Action" },
  { id: 12, name: "Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 14, name: "Fantasy" },
  { id: 36, name: "History" },
  { id: 27, name: "Horror" },
  { id: 10402, name: "Music" },
  { id: 9648, name: "Mystery" },
  { id: 10749, name: "Romance" },
  { id: 878, name: "Sci-Fi" },
  { id: 53, name: "Thriller" },
  { id: 10752, name: "War" },
  { id: 37, name: "Western" }
];

export const TV_GENRES: Genre[] = [
  { id: 10759, name: "Action & Adventure" },
  { id: 16, name: "Animation" },
  { id: 35, name: "Comedy" },
  { id: 80, name: "Crime" },
  { id: 99, name: "Documentary" },
  { id: 18, name: "Drama" },
  { id: 10751, name: "Family" },
  { id: 10762, name: "Kids" },
  { id: 9648, name: "Mystery" },
  { id: 10763, name: "News" },
  { id: 10764, name: "Reality" },
  { id: 10765, name: "Sci-Fi & Fantasy" },
  { id: 10766, name: "Soap" },
  { id: 10767, name: "Talk" },
  { id: 10768, name: "War & Politics" },
  { id: 37, name: "Western" }
];

export const MOVIE_CATEGORIES: Category[] = [
  { id: "trending", name: "Trending", endpoint: "/trending/movie/week" },
  { id: "popular", name: "Popular", endpoint: "/movie/popular" },
  { id: "now_playing", name: "Now Playing", endpoint: "/movie/now_playing" },
  { id: "top_rated", name: "Top Rated", endpoint: "/movie/top_rated" },
  { id: "upcoming", name: "Upcoming", endpoint: "/movie/upcoming" }
];

export const TV_CATEGORIES: Category[] = [
  { id: "trending", name: "Trending", endpoint: "/trending/tv/week" },
  { id: "popular", name: "Popular", endpoint: "/tv/popular" },
  { id: "on_the_air", name: "On The Air", endpoint: "/tv/on_the_air" },
  { id: "top_rated", name: "Top Rated", endpoint: "/tv/top_rated" },
  { id: "airing_today", name: "Airing Today", endpoint: "/tv/airing_today" }
];

export function useTMDBData(
  genres: Genre[],
  categories: Category[],
  mediaType: MediaType,
  shouldLoad = true
) {
  const [genreMedia, setGenreMedia] = useState<{
    [id: number]: TMDBMediaItem[];
  }>({});
  const [categoryMedia, setCategoryMedia] = useState<{
    [categoryId: string]: TMDBMediaItem[];
  }>({});
  const [isLoading, setIsLoading] = useState(false);

  const getTrendingMovies = useAction(api.tmdb.getTrendingMovies);
  const getPopularTVShows = useAction(api.tmdb.getPopularTVShows);

  const fetchMedia = useCallback(
    async (endpoint: string, key: string | number, isGenre: boolean) => {
      try {
        let results: TMDBMediaItem[] = [];

        if (mediaType === "movie") {
          if (endpoint.includes("/trending/")) {
            const data = await getTrendingMovies({ page: 1 });
            results = data.map((m) => ({ ...m, type: "movie" as const }));
          } else {
            const data = await getTrendingMovies({ page: 1 });
            results = data.map((m) => ({ ...m, type: "movie" as const }));
            if (isGenre && typeof key === "number") {
              results = results.filter((m) => m.genre.length > 0);
            }
          }
        } else {
          if (endpoint.includes("/tv/popular") || endpoint.includes("/trending/")) {
            const data = await getPopularTVShows({ page: 1 });
            results = data.map((s) => ({ ...s, type: "tv" as const }));
          } else {
            const data = await getPopularTVShows({ page: 1 });
            results = data.map((s) => ({ ...s, type: "tv" as const }));
          }
        }

        return results;
      } catch (error) {
        console.error(
          `Error fetching ${mediaType} for ${isGenre ? "genre" : "category"} ${key}:`,
          error
        );
        return [];
      }
    },
    [mediaType, getTrendingMovies, getPopularTVShows]
  );

  useEffect(() => {
    if (!shouldLoad || genres.length === 0) return;

    const fetchMediaForGenres = async () => {
      setIsLoading(true);
      const genrePromises = genres.map(async (genre) => {
        const media = await fetchMedia(`/discover/${mediaType}`, genre.id, true);
        setGenreMedia((prev) => ({ ...prev, [genre.id]: media }));
      });
      await Promise.all(genrePromises);
      setIsLoading(false);
    };

    fetchMediaForGenres();
  }, [genres, mediaType, fetchMedia, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad || categories.length === 0) return;

    const fetchMediaForCategories = async () => {
      setIsLoading(true);
      const categoryPromises = categories.map(async (category) => {
        const media = await fetchMedia(category.endpoint, category.id, false);
        setCategoryMedia((prev) => ({ ...prev, [category.id]: media }));
      });
      await Promise.all(categoryPromises);
      setIsLoading(false);
    };

    fetchMediaForCategories();
  }, [categories, mediaType, fetchMedia, shouldLoad]);

  return { genreMedia, categoryMedia, isLoading };
}

export function useLazyTMDBData(
  genre: Genre | null,
  category: Category | null,
  mediaType: MediaType,
  shouldLoad = false
) {
  const [media, setMedia] = useState<TMDBMediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getTrendingMovies = useAction(api.tmdb.getTrendingMovies);
  const getPopularTVShows = useAction(api.tmdb.getPopularTVShows);

  const fetchMedia = useCallback(
    async (endpoint: string, key: string | number, isGenre: boolean) => {
      try {
        setIsLoading(true);
        let results: TMDBMediaItem[] = [];

        if (mediaType === "movie") {
          const data = await getTrendingMovies({ page: 1 });
          results = data.map((m) => ({ ...m, type: "movie" as const }));
        } else {
          const data = await getPopularTVShows({ page: 1 });
          results = data.map((s) => ({ ...s, type: "tv" as const }));
        }

        setMedia(results);
        setIsLoading(false);
        return results;
      } catch (error) {
        console.error(`Error fetching ${mediaType} for ${isGenre ? "genre" : "category"}:`, error);
        setIsLoading(false);
        return [];
      }
    },
    [mediaType, getTrendingMovies, getPopularTVShows]
  );

  useEffect(() => {
    if (!shouldLoad) return;

    if (genre) {
      fetchMedia(`/discover/${mediaType}`, genre.id, true);
    } else if (category) {
      fetchMedia(category.endpoint, category.id, false);
    }
  }, [genre, category, mediaType, fetchMedia, shouldLoad]);

  return { media, isLoading };
}

export function useIMDbMetadata(imdbId: string | undefined, type: MediaType | undefined) {
  const [metadata, setMetadata] = useState<{
    title?: string;
    year?: number | null;
    runtime?: number | null;
    age_rating?: string;
    imdb_rating?: number | null;
    votes?: number | null;
    plot?: string;
    poster_url?: string;
    trailer_url?: string;
    genre?: string[];
    cast?: string[];
    directors?: string[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getIMDbMetadata = useAction(api.tmdb.getIMDbMetadata);

  useEffect(() => {
    if (!imdbId) {
      setMetadata(null);
      return;
    }

    const fetchMetadata = async () => {
      setIsLoading(true);
      try {
        const results = await getIMDbMetadata({ imdbId, type });
        setMetadata(results);
      } catch (error) {
        console.error("Error fetching IMDb metadata:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMetadata();
  }, [imdbId, type, getIMDbMetadata]);

  return { metadata, isLoading };
}
