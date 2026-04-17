import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";

const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBMovieListItem {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  genre_ids?: number[];
  vote_average: number;
}

interface TMDBTVListItem {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date?: string;
  genre_ids?: number[];
  vote_average: number;
}

interface TMDBMovieDetails extends TMDBMovieListItem {
  genres?: TMDBGenre[];
  runtime?: number;
  imdb_id?: string;
}

interface TMDBTVDetails extends TMDBTVListItem {
  genres?: TMDBGenre[];
  number_of_seasons?: number;
  episode_run_time?: number[];
  external_ids?: {
    imdb_id?: string;
  };
}

type SyncType = "movies" | "tv";
type TMDBListItem = TMDBMovieListItem | TMDBTVListItem;

interface TMDBListResponse<T> {
  page: number;
  total_pages: number;
  results: T[];
}

type SyncFlags = {
  trending: boolean;
  popular: boolean;
  new: boolean;
  featured: boolean;
};

type SyncSeed = {
  id: number;
  type: "movie" | "tv";
  title: string;
  flags: SyncFlags;
  order: number;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage: number;
  genreIds: number[];
};

async function fetchTMDB<T>(endpoint: string): Promise<T | null> {
  try {
    const url = `${TMDB_BASE_URL}${endpoint}${endpoint.includes("?") ? "&" : "?"}api_key=${TMDB_API_KEY}&language=en-US`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      }
    });

    if (!response.ok) {
      console.error(`TMDB API error: ${response.status} ${response.statusText}`);
      return null;
    }

    return (await response.json()) as T;
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

function getGenresByIds(genreIds: number[]): string[] {
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
    10768: "War & Politics"
  };

  return genreIds
    .map((id) => genreMap[id] || "Unknown")
    .filter((genre) => genre !== "Unknown");
}

function extractGenres(
  item: { genres?: TMDBGenre[]; genre_ids?: number[] } | undefined
): string[] {
  if (!item) return [];
  if (item.genres && item.genres.length > 0) {
    return item.genres.map((genre) => genre.name).filter(Boolean);
  }
  return getGenresByIds(item.genre_ids || []);
}

function getRating(voteAverage: number): string {
  if (voteAverage >= 8) return "R";
  if (voteAverage >= 6) return "PG-13";
  if (voteAverage >= 4) return "PG";
  return "G";
}

function getYear(date?: string): number {
  const parsedYear = date?.split("-")[0];
  return Number(parsedYear || "2024");
}

function formatRuntime(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function mergeFlags(current: SyncFlags, incoming: Partial<SyncFlags>): SyncFlags {
  return {
    trending: current.trending || !!incoming.trending,
    popular: current.popular || !!incoming.popular,
    new: current.new || !!incoming.new,
    featured: current.featured || !!incoming.featured
  };
}

function getEmptyFlags(): SyncFlags {
  return {
    trending: false,
    popular: false,
    new: false,
    featured: false
  };
}

function getFlagSources(type: SyncType): Array<{
  endpoint: string;
  flags: Partial<SyncFlags>;
}> {
  if (type === "movies") {
    return [
      { endpoint: "/trending/movie/week", flags: { trending: true, featured: true } },
      { endpoint: "/movie/popular", flags: { popular: true } },
      { endpoint: "/movie/now_playing", flags: { new: true } },
      { endpoint: "/movie/top_rated", flags: {} }
    ];
  }

  return [
    { endpoint: "/trending/tv/week", flags: { trending: true, featured: true } },
    { endpoint: "/tv/popular", flags: { popular: true } },
    { endpoint: "/tv/on_the_air", flags: { new: true } },
    { endpoint: "/tv/top_rated", flags: {} }
  ];
}

function getCatalogEndpoint(type: SyncType, page: number): string {
  const baseParams = `page=${page}&include_adult=false&sort_by=popularity.desc&vote_count.gte=25`;
  return type === "movies"
    ? `/discover/movie?${baseParams}&include_video=false`
    : `/discover/tv?${baseParams}`;
}

function seedFromListItem(
  type: SyncType,
  item: TMDBListItem,
  order: number,
  flags: SyncFlags
): SyncSeed {
  return {
    id: item.id,
    type: type === "movies" ? "movie" : "tv",
    title: "title" in item ? item.title : item.name,
    flags,
    order,
    overview: item.overview,
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    releaseDate: "release_date" in item ? item.release_date : undefined,
    firstAirDate: "first_air_date" in item ? item.first_air_date : undefined,
    voteAverage: item.vote_average,
    genreIds: item.genre_ids || []
  };
}

async function collectFlagMap(type: SyncType, pageCount: number): Promise<Map<number, SyncFlags>> {
  const merged = new Map<number, SyncFlags>();

  for (const source of getFlagSources(type)) {
    for (let page = 1; page <= pageCount; page += 1) {
      const data = await fetchTMDB<TMDBListResponse<TMDBListItem>>(
        `${source.endpoint}?page=${page}`
      );

      if (!data?.results?.length) break;

      for (const item of data.results) {
        merged.set(item.id, mergeFlags(merged.get(item.id) || getEmptyFlags(), source.flags));
      }
    }
  }

  return merged;
}

async function getSyncSeeds(type: SyncType, count: number): Promise<SyncSeed[]> {
  const normalizedCount = Math.max(1, Math.min(count, 10000));
  const requiredPages = Math.max(1, Math.ceil(normalizedCount / 20));
  const flagPages = Math.max(3, Math.min(10, Math.ceil(requiredPages / 4)));
  const flagMap = await collectFlagMap(type, flagPages);
  const seeds: SyncSeed[] = [];
  let order = 0;

  for (let page = 1; page <= requiredPages && seeds.length < normalizedCount; page += 1) {
    const data = await fetchTMDB<TMDBListResponse<TMDBListItem>>(getCatalogEndpoint(type, page));
    if (!data?.results?.length) break;

    for (const item of data.results) {
      seeds.push(seedFromListItem(type, item, order, flagMap.get(item.id) || getEmptyFlags()));
      order += 1;

      if (seeds.length >= normalizedCount) {
        break;
      }
    }
  }

  return seeds;
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const output: R[] = [];

  for (let index = 0; index < items.length; index += batchSize) {
    const batch = items.slice(index, index + batchSize);
    const results = await Promise.all(batch.map((item, batchIndex) => fn(item, index + batchIndex)));
    output.push(...results);
  }

  return output;
}

export const searchMovies = action({
  args: { query: v.string() },
  handler: async (
    _ctx,
    { query }
  ): Promise<
    Array<{
      tmdbId: number;
      title: string;
      description: string;
      posterUrl: string;
      backdropUrl: string;
      year: number;
      genre: string[];
      rating: string;
      imdbId?: string;
    }>
  > => {
    const data = await fetchTMDB<{ results: TMDBMovieListItem[] }>(
      `/search/movie?query=${encodeURIComponent(query)}`
    );

    if (!data?.results) return [];

    return data.results.slice(0, 10).map((movie) => ({
      tmdbId: movie.id,
      title: movie.title,
      description: movie.overview || "No description available",
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      year: getYear(movie.release_date),
      genre: extractGenres(movie),
      rating: getRating(movie.vote_average)
    }));
  }
});

export const getMovieDetails = action({
  args: { tmdbId: v.number() },
  handler: async (
    _ctx,
    { tmdbId }
  ): Promise<{
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
    const movie = await fetchTMDB<TMDBMovieDetails>(`/movie/${tmdbId}?append_to_response=external_ids`);

    if (!movie) return null;

    return {
      tmdbId: movie.id,
      imdbId: movie.imdb_id,
      title: movie.title,
      description: movie.overview || "No description available",
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      year: getYear(movie.release_date),
      genre: extractGenres(movie),
      rating: getRating(movie.vote_average),
      duration: formatRuntime(movie.runtime)
    };
  }
});

export const getTrendingMovies = action({
  args: { page: v.optional(v.number()) },
  handler: async (
    _ctx,
    { page = 1 }
  ): Promise<
    Array<{
      tmdbId: number;
      title: string;
      description: string;
      posterUrl: string;
      backdropUrl: string;
      year: number;
      genre: string[];
      rating: string;
    }>
  > => {
    const data = await fetchTMDB<{ results: TMDBMovieListItem[] }>(`/trending/movie/week?page=${page}`);

    if (!data?.results) return [];

    return data.results.slice(0, 20).map((movie) => ({
      tmdbId: movie.id,
      title: movie.title,
      description: movie.overview || "No description available",
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      year: getYear(movie.release_date),
      genre: extractGenres(movie),
      rating: getRating(movie.vote_average)
    }));
  }
});

export const getPopularTVShows = action({
  args: { page: v.optional(v.number()) },
  handler: async (
    _ctx,
    { page = 1 }
  ): Promise<
    Array<{
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
    }>
  > => {
    const data = await fetchTMDB<{ results: TMDBTVListItem[] }>(`/tv/popular?page=${page}`);

    if (!data?.results) return [];

    const showsWithDetails = await mapInBatches(data.results.slice(0, 10), 4, async (show) => {
      const details = await fetchTMDB<TMDBTVDetails>(`/tv/${show.id}?append_to_response=external_ids`);

      return {
        tmdbId: show.id,
        title: show.name,
        description: details?.overview || show.overview || "No description available",
        posterUrl: getPosterUrl(details?.poster_path ?? show.poster_path),
        backdropUrl: getBackdropUrl(details?.backdrop_path ?? show.backdrop_path),
        year: getYear(details?.first_air_date ?? show.first_air_date),
        genre: extractGenres(details || show),
        rating: getRating(details?.vote_average ?? show.vote_average),
        seasons: details?.number_of_seasons,
        imdbId: details?.external_ids?.imdb_id
      };
    });

    return showsWithDetails;
  }
});

export const syncContent = action({
  args: {
    type: v.union(v.literal("movies"), v.literal("tv")),
    count: v.optional(v.number())
  },
  handler: async (ctx, { type, count = 10 }): Promise<number> => {
    const seeds = await getSyncSeeds(type, count);
    const now = Date.now();
    const detailSeedLimit = Math.min(Math.max(40, Math.ceil(seeds.length * 0.15)), 120);

    const payloads = await mapInBatches(seeds, 5, async (seed, index) => {
      const shouldFetchDetails =
        index < detailSeedLimit || seed.flags.trending || seed.flags.popular || seed.flags.new;
      const details =
        shouldFetchDetails
          ? seed.type === "movie"
            ? await fetchTMDB<TMDBMovieDetails>(`/movie/${seed.id}?append_to_response=external_ids`)
            : await fetchTMDB<TMDBTVDetails>(`/tv/${seed.id}?append_to_response=external_ids`)
          : null;

      const isMovie = seed.type === "movie";
      const runtime =
        details && isMovie
          ? formatRuntime((details as TMDBMovieDetails).runtime)
          : details
            ? formatRuntime((details as TMDBTVDetails).episode_run_time?.[0])
            : undefined;
      const hasBackdrop = Boolean(details?.backdrop_path || seed.backdropPath);

      return {
        title:
          (isMovie
            ? (details as TMDBMovieDetails | null)?.title
            : (details as TMDBTVDetails | null)?.name) ||
          seed.title ||
          (isMovie ? `Movie ${seed.id}` : `Show ${seed.id}`),
        description: details?.overview || seed.overview || "No description available",
        type: isMovie ? ("movie" as const) : ("tv" as const),
        genre: extractGenres(details || { genre_ids: seed.genreIds }),
        year: getYear(
          isMovie
            ? (details as TMDBMovieDetails | null)?.release_date || seed.releaseDate
            : (details as TMDBTVDetails | null)?.first_air_date || seed.firstAirDate
        ),
        rating: getRating(details?.vote_average || seed.voteAverage),
        posterUrl: getPosterUrl(details?.poster_path || seed.posterPath),
        backdropUrl: getBackdropUrl(details?.backdrop_path || seed.backdropPath),
        tmdbId: String(seed.id),
        imdbId: isMovie
          ? (details as TMDBMovieDetails | null)?.imdb_id || undefined
          : (details as TMDBTVDetails | null)?.external_ids?.imdb_id || undefined,
        duration: runtime,
        seasons: !isMovie ? (details as TMDBTVDetails | null)?.number_of_seasons : undefined,
        trending: seed.flags.trending,
        popular: seed.flags.popular || seed.order < 40,
        featured: false,
        new: seed.flags.new,
        createdAt: now,
        updatedAt: now,
        order: seed.order,
        hasBackdrop,
        flagPriority:
          Number(seed.flags.featured) + Number(seed.flags.trending) + Number(seed.flags.popular)
      };
    });

    const featuredIndex = payloads.findIndex(
      (item) => item.hasBackdrop && (item.flagPriority > 0 || item.order === 0)
    );

    const items = payloads.map(({ order, flagPriority, hasBackdrop, ...item }, index) => ({
      ...item,
      featured: index === featuredIndex
    }));

    let syncedCount = 0;
    for (let index = 0; index < items.length; index += 100) {
      syncedCount += await ctx.runMutation(internal.content.upsertBatchFromTMDB, {
        items: items.slice(index, index + 100)
      });
    }

    return syncedCount;
  }
});
