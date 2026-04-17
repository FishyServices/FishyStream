import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface TMDBMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  genre_ids: number[];
  vote_average: number;
  runtime?: number;
  imdb_id?: string;
}

interface TMDBTVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  genre_ids: number[];
  vote_average: number;
  number_of_seasons?: number;
  external_ids?: {
    imdb_id?: string;
  };
}

interface TMDBGenre {
  id: number;
  name: string;
}

async function fetchTMDB<T>(endpoint: string): Promise<T | null> {
  try {
    const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&language=en-US`;
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    
    if (!response.ok) {
      console.error(`TMDB API error: ${response.status} ${response.statusText}`);
      return null;
    }
    
    return await response.json() as T;
  } catch (error) {
    console.error("TMDB fetch error:", error);
    return null;
  }
}

function getPosterUrl(path: string | null): string {
  if (!path) return "https://via.placeholder.com/500x750?text=No+Poster";
  return `${TMDB_IMAGE_BASE}/w500${path}`;
}

function getBackdropUrl(path: string | null): string {
  if (!path) return "https://via.placeholder.com/1920x1080?text=No+Backdrop";
  return `${TMDB_IMAGE_BASE}/original${path}`;
}

function getGenres(genreIds: number[]): string[] {
  const genreMap: Record<number, string> = {
    28: "Action",
    12: "Adventure",
    16: "Animation",
    35: "Comedy",
    80: "Crime",
    99: "Documentary",
    18: "Drama",
    10751: "Family",
    14: "Fantasy",
    36: "History",
    27: "Horror",
    10402: "Music",
    9648: "Mystery",
    10749: "Romance",
    878: "Sci-Fi",
    10770: "TV Movie",
    53: "Thriller",
    10752: "War",
    37: "Western",
    10759: "Action & Adventure",
    10762: "Kids",
    10763: "News",
    10764: "Reality",
    10765: "Sci-Fi & Fantasy",
    10766: "Soap",
    10767: "Talk",
    10768: "War & Politics",
  };
  
  return genreIds.map(id => genreMap[id] || "Unknown").filter(g => g !== "Unknown");
}

function getRating(voteAverage: number): string {
  if (voteAverage >= 8) return "R";
  if (voteAverage >= 6) return "PG-13";
  if (voteAverage >= 4) return "PG";
  return "G";
}

// Action to search movies on TMDB
export const searchMovies = action({
  args: { query: v.string() },
  handler: async (_ctx, { query }): Promise<Array<{
    tmdbId: number;
    title: string;
    description: string;
    posterUrl: string;
    backdropUrl: string;
    year: number;
    genre: string[];
    rating: string;
    imdbId?: string;
  }>> => {
    const data = await fetchTMDB<{ results: TMDBMovie[] }>(
      `/search/movie?query=${encodeURIComponent(query)}`
    );
    
    if (!data?.results) return [];
    
    return data.results.slice(0, 10).map(movie => ({
      tmdbId: movie.id,
      title: movie.title,
      description: movie.overview || "No description available",
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      year: parseInt(movie.release_date?.split("-")[0] || "2024"),
      genre: getGenres(movie.genre_ids),
      rating: getRating(movie.vote_average),
    }));
  },
});

// Action to get movie details including IMDB ID
export const getMovieDetails = action({
  args: { tmdbId: v.number() },
  handler: async (_ctx, { tmdbId }): Promise<{
    tmdbId: number;
    imdbId?: string;
    title: string;
    description: string;
    posterUrl: string;
    backdropUrl: string;
    year: number;
    genre: string[];
    rating: string;
    duration?: string;
  } | null> => {
    const movie = await fetchTMDB<TMDBMovie & { runtime?: number; imdb_id?: string }>(
      `/movie/${tmdbId}?append_to_response=external_ids`
    );
    
    if (!movie) return null;
    
    const duration = movie.runtime 
      ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m`
      : undefined;
    
    return {
      tmdbId: movie.id,
      imdbId: movie.imdb_id,
      title: movie.title,
      description: movie.overview || "No description available",
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      year: parseInt(movie.release_date?.split("-")[0] || "2024"),
      genre: getGenres(movie.genre_ids),
      rating: getRating(movie.vote_average),
      duration,
    };
  },
});

// Action to get trending movies
export const getTrendingMovies = action({
  args: { page: v.optional(v.number()) },
  handler: async (_ctx, { page = 1 }): Promise<Array<{
    tmdbId: number;
    title: string;
    description: string;
    posterUrl: string;
    backdropUrl: string;
    year: number;
    genre: string[];
    rating: string;
  }>> => {
    const data = await fetchTMDB<{ results: TMDBMovie[] }>(
      `/trending/movie/week?page=${page}`
    );
    
    if (!data?.results) return [];
    
    return data.results.slice(0, 20).map(movie => ({
      tmdbId: movie.id,
      title: movie.title,
      description: movie.overview || "No description available",
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      year: parseInt(movie.release_date?.split("-")[0] || "2024"),
      genre: getGenres(movie.genre_ids),
      rating: getRating(movie.vote_average),
    }));
  },
});

// Action to get popular TV shows
export const getPopularTVShows = action({
  args: { page: v.optional(v.number()) },
  handler: async (_ctx, { page = 1 }): Promise<Array<{
    tmdbId: number;
    title: string;
    description: string;
    posterUrl: string;
    backdropUrl: string;
    year: number;
    genre: string[];
    rating: string;
    seasons?: number;
    imdbId?: string;
  }>> => {
    const data = await fetchTMDB<{ results: TMDBTVShow[] }>(
      `/tv/popular?page=${page}`
    );
    
    if (!data?.results) return [];
    
    const showsWithDetails = await Promise.all(
      data.results.slice(0, 10).map(async (show) => {
        const details = await fetchTMDB<TMDBTVShow & { external_ids?: { imdb_id?: string } }>(
          `/tv/${show.id}?append_to_response=external_ids`
        );
        
        return {
          tmdbId: show.id,
          title: show.name,
          description: show.overview || "No description available",
          posterUrl: getPosterUrl(show.poster_path),
          backdropUrl: getBackdropUrl(show.backdrop_path),
          year: parseInt(show.first_air_date?.split("-")[0] || "2024"),
          genre: getGenres(show.genre_ids),
          rating: getRating(show.vote_average),
          seasons: details?.number_of_seasons,
          imdbId: details?.external_ids?.imdb_id,
        };
      })
    );
    
    return showsWithDetails;
  },
});

// Action to sync TMDB content to Convex database
export const syncContent = action({
  args: { 
    type: v.union(v.literal("movies"), v.literal("tv")),
    count: v.optional(v.number()) 
  },
  handler: async (ctx, { type, count = 10 }): Promise<number> => {
    let items: Array<any> = [];
    
    if (type === "movies") {
      items = await fetchTMDB<{ results: TMDBMovie[] }>(`/trending/movie/week`)
        .then(d => d?.results?.slice(0, count) || []);
    } else {
      items = await fetchTMDB<{ results: TMDBTVShow[] }>(`/tv/popular`)
        .then(d => d?.results?.slice(0, count) || []);
    }
    
    let syncedCount = 0;
    const now = Date.now();
    
    for (const item of items) {
      const details = type === "movies" 
        ? await fetchTMDB<TMDBMovie & { runtime?: number; imdb_id?: string }>(`/movie/${item.id}?append_to_response=external_ids`)
        : await fetchTMDB<TMDBTVShow & { external_ids?: { imdb_id?: string } }>(`/tv/${item.id}?append_to_response=external_ids`);
      
      if (!details) continue;
      
      const isMovie = type === "movies";
      const contentData = {
        title: isMovie ? (details as TMDBMovie).title : (details as TMDBTVShow).name,
        description: details.overview || "No description available",
        type: isMovie ? "movie" as const : "tv" as const,
        genre: getGenres(details.genre_ids || []),
        year: parseInt(
          isMovie 
            ? (details as TMDBMovie).release_date?.split("-")[0] || "2024"
            : (details as TMDBTVShow).first_air_date?.split("-")[0] || "2024"
        ),
        rating: getRating(details.vote_average),
        posterUrl: getPosterUrl(details.poster_path),
        backdropUrl: getBackdropUrl(details.backdrop_path),
        tmdbId: String(details.id),
        imdbId: isMovie 
          ? (details as TMDBMovie).imdb_id 
          : (details as TMDBTVShow).external_ids?.imdb_id,
        duration: isMovie && (details as TMDBMovie).runtime
          ? `${Math.floor((details as TMDBMovie).runtime! / 60)}h ${(details as TMDBMovie).runtime! % 60}m`
          : undefined,
        seasons: !isMovie ? (details as TMDBTVShow).number_of_seasons : undefined,
        trending: true,
        popular: true,
        featured: syncedCount === 0,
        new: true,
        createdAt: now,
        updatedAt: now,
      };
      
      try {
        await ctx.runMutation(internal.content.createFromTMDB, contentData);
        syncedCount++;
      } catch (e) {
        console.log("Content may already exist");
      }
    }
    
    return syncedCount;
  },
});
