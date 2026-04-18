"use node";
import { v } from "convex/values";
import { action, query, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_BASE_URL_2 = "https://api.tmdb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

// ─── Cache Implementation ─────────────────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

class SimpleCache<K, V> {
  private store = new Map<string, CacheEntry<V>>();
  private keySerializer: (key: K) => string;

  constructor(keySerializer?: (key: K) => string) {
    this.keySerializer = keySerializer || ((k) => JSON.stringify(k));
  }

  get(key: K): V | undefined {
    const serialized = this.keySerializer(key);
    const entry = this.store.get(serialized);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.store.delete(serialized);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlSeconds: number): void {
    const serialized = this.keySerializer(key);
    this.store.set(serialized, {
      value,
      expiry: Date.now() + ttlSeconds * 1000
    });
  }

  clear(): void {
    this.store.clear();
  }
}

interface TMDBCacheKey {
  url: string;
  params: Record<string, string>;
  language: string;
}

const tmdbCache = new SimpleCache<TMDBCacheKey, any>(
  (key) => `${key.url}|${JSON.stringify(key.params)}|${key.language}`
);

let proxyRotationIndex = 0;
function getNextProxy(proxyUrls: string[]): string | undefined {
  if (!proxyUrls.length) return undefined;
  const proxy = proxyUrls[proxyRotationIndex % proxyUrls.length];
  proxyRotationIndex += 1;
  return proxy;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TMDBGenre {
  id: number;
  name: string;
}
interface TMDBProductionCountry {
  iso_3166_1: string;
  name: string;
}
interface TMDBSpokenLanguage {
  iso_639_1: string;
  name: string;
}
interface TMDBVideo {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}
interface TMDBLogo {
  file_path: string;
  iso_639_1: string;
  vote_average: number;
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
  vote_count?: number;
  popularity?: number;
  original_language?: string;
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
  vote_count?: number;
  popularity?: number;
  original_language?: string;
}

interface TMDBMovieDetails extends TMDBMovieListItem {
  genres?: TMDBGenre[];
  runtime?: number;
  imdb_id?: string;
  status?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  production_countries?: TMDBProductionCountry[];
  spoken_languages?: TMDBSpokenLanguage[];
  videos?: { results: TMDBVideo[] };
  images?: { logos?: TMDBLogo[] };
  external_ids?: { imdb_id?: string };
}

interface TMDBTVDetails extends TMDBTVListItem {
  genres?: TMDBGenre[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  tagline?: string;
  production_countries?: TMDBProductionCountry[];
  spoken_languages?: TMDBSpokenLanguage[];
  videos?: { results: TMDBVideo[] };
  images?: { logos?: TMDBLogo[] };
  external_ids?: { imdb_id?: string };
  seasons?: Array<{
    id: number;
    season_number: number;
    name: string;
    overview: string;
    poster_path: string | null;
    air_date: string | null;
    episode_count: number;
  }>;
}

interface TMDBEpisode {
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
}

interface TMDBSeasonDetails {
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episodes: TMDBEpisode[];
}

type TMDBListItem = TMDBMovieListItem | TMDBTVListItem;
interface TMDBListResponse<T> {
  page: number;
  total_pages: number;
  results: T[];
}

// ─── Core API Client  ──────────────────────────────────────────

function isV4Token(key: string): boolean {
  return key.split(".").length === 3;
}

async function get<T>(
  endpoint: string,
  params: Record<string, string> = {},
  proxyUrls: string[] = []
): Promise<T | null> {
  const language = params.language || "en-US";

  const cacheKey: TMDBCacheKey = { url: endpoint, params, language };
  const cached = tmdbCache.get(cacheKey);
  if (cached) return cached as T;

  const apiKey = TMDB_API_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (isV4Token(apiKey)) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const allParams = {
    ...params,
    language,
    ...(!isV4Token(apiKey) ? { api_key: apiKey } : {})
  };

  const buildUrl = (base: string) => {
    const url = new URL(base + endpoint);
    Object.entries(allParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
    return url.toString();
  };

  let result: T | null = null;
  const proxy = getNextProxy(proxyUrls);

  if (proxy) {
    try {
      const proxyUrl = `${proxy}/?destination=${encodeURIComponent(buildUrl(TMDB_BASE_URL))}`;
      const res = await fetch(proxyUrl, {
        headers,
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        result = (await res.json()) as T;
      }
    } catch {}
  }

  if (!result) {
    try {
      const res = await fetch(buildUrl(TMDB_BASE_URL), {
        headers,
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        result = (await res.json()) as T;
      }
    } catch {}
  }

  if (!result) {
    try {
      const res = await fetch(buildUrl(TMDB_BASE_URL_2), {
        headers,
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) {
        result = (await res.json()) as T;
      }
    } catch {
      return null;
    }
  }

  if (result) {
    tmdbCache.set(cacheKey, result, 3600);
  }

  return result;
}

async function fetchTMDB<T>(
  endpoint: string,
  extraParams: Record<string, string> = {}
): Promise<T | null> {
  return get<T>(endpoint, extraParams);
}

function getPosterUrl(path: string | null, size = "w500"): string {
  if (!path) return `https://placehold.co/500x750/1a1a2e/666?text=No+Poster`;
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

function getBackdropUrl(path: string | null): string {
  if (!path) return `https://placehold.co/1920x1080/0a0a12/333?text=No+Backdrop`;
  return `${TMDB_IMAGE_BASE}/original${path}`;
}

function getStillUrl(path: string | null): string {
  if (!path) return "";
  return `${TMDB_IMAGE_BASE}/w500${path}`;
}

function getLogoUrl(logos: TMDBLogo[] | undefined): string | undefined {
  if (!logos?.length) return undefined;
  const en = logos
    .filter((l) => l.iso_639_1 === "en")
    .sort((a, b) => b.vote_average - a.vote_average)[0];
  const best = en ?? logos.sort((a, b) => b.vote_average - a.vote_average)[0];
  if (!best) return undefined;
  return `${TMDB_IMAGE_BASE}/w500${best.file_path}`;
}

function getTrailerKey(videos: TMDBVideo[] | undefined): string | undefined {
  if (!videos?.length) return undefined;
  const priority = ["Official Trailer", "Trailer", "Teaser", "Clip", "Featurette"];
  for (const type of priority) {
    const v = videos.find((v) => v.site === "YouTube" && v.type === type && v.official);
    if (v) return v.key;
  }
  const any = videos.find((v) => v.site === "YouTube" && v.type === "Trailer");
  return any?.key;
}

const GENRE_MAP: Record<number, string> = {
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

function getGenres(item: { genres?: TMDBGenre[]; genre_ids?: number[] }): string[] {
  if (item.genres?.length) return item.genres.map((g) => g.name);
  return (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean) as string[];
}

function getRating(voteAverage: number): string {
  if (voteAverage >= 8) return "TV-MA";
  if (voteAverage >= 6) return "PG-13";
  if (voteAverage >= 4) return "PG";
  return "G";
}

function getYear(date?: string): number {
  return parseInt(date?.split("-")[0] ?? "2024") || 2024;
}

function formatRuntime(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((item, bi) => fn(item, i + bi)));
    out.push(...results);
  }
  return out;
}

// ─── Public Actions ───────────────────────────────────────────────────────────

export const searchMovies = action({
  args: { query: v.string() },
  handler: async (_ctx, { query }) => {
    const data = await get<{ results: (TMDBMovieListItem & { popularity: number })[] }>(
      `/search/movie`,
      { query: encodeURIComponent(query), sort_by: "popularity.desc" }
    );
    if (!data?.results) return [];
    return data.results
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 20)
      .map((movie) => ({
        tmdbId: movie.id,
        title: movie.title,
        description: movie.overview || "No description available",
        posterUrl: getPosterUrl(movie.poster_path),
        backdropUrl: getBackdropUrl(movie.backdrop_path),
        year: getYear(movie.release_date),
        genre: getGenres(movie),
        rating: getRating(movie.vote_average),
        voteAverage: movie.vote_average,
        popularity: movie.popularity
      }));
  }
});

export const searchTVShows = action({
  args: { query: v.string() },
  handler: async (_ctx, { query }) => {
    const data = await get<{ results: (TMDBTVListItem & { popularity: number })[] }>(`/search/tv`, {
      query: encodeURIComponent(query)
    });
    if (!data?.results) return [];
    const sorted = data.results.sort((a, b) => b.popularity - a.popularity).slice(0, 20);
    return await mapInBatches(sorted, 5, async (show) => {
      const details = await get<TMDBTVDetails>(`/tv/${show.id}`, {
        append_to_response: "external_ids"
      });
      return {
        tmdbId: show.id,
        title: show.name,
        description: details?.overview || show.overview || "No description available",
        posterUrl: getPosterUrl(details?.poster_path ?? show.poster_path),
        backdropUrl: getBackdropUrl(details?.backdrop_path ?? show.backdrop_path),
        year: getYear(details?.first_air_date ?? show.first_air_date),
        genre: getGenres(details || show),
        rating: getRating(details?.vote_average ?? show.vote_average),
        voteAverage: show.vote_average,
        seasons: details?.number_of_seasons,
        imdbId: details?.external_ids?.imdb_id,
        popularity: show.popularity
      };
    });
  }
});

export const getMovieDetails = action({
  args: { tmdbId: v.number() },
  handler: async (_ctx, { tmdbId }) => {
    const movie = await get<TMDBMovieDetails>(`/movie/${tmdbId}`, {
      append_to_response: "external_ids,videos,images"
    });
    if (!movie) return null;
    return {
      tmdbId: movie.id,
      imdbId: movie.imdb_id || movie.external_ids?.imdb_id,
      title: movie.title,
      description: movie.overview || "No description available",
      tagline: movie.tagline,
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      logoUrl: getLogoUrl(movie.images?.logos),
      trailerKey: getTrailerKey(movie.videos?.results),
      year: getYear(movie.release_date),
      genre: getGenres(movie),
      rating: getRating(movie.vote_average),
      voteAverage: movie.vote_average,
      duration: formatRuntime(movie.runtime),
      status: movie.status,
      budget: movie.budget,
      revenue: movie.revenue
    };
  }
});

export const getTVDetails = action({
  args: { tmdbId: v.number() },
  handler: async (_ctx, { tmdbId }) => {
    const show = await get<TMDBTVDetails>(`/tv/${tmdbId}`, {
      append_to_response: "external_ids,videos,images"
    });
    if (!show) return null;
    return {
      tmdbId: show.id,
      imdbId: show.external_ids?.imdb_id,
      title: show.name,
      description: show.overview || "No description available",
      tagline: show.tagline,
      posterUrl: getPosterUrl(show.poster_path),
      backdropUrl: getBackdropUrl(show.backdrop_path),
      logoUrl: getLogoUrl(show.images?.logos),
      trailerKey: getTrailerKey(show.videos?.results),
      year: getYear(show.first_air_date),
      genre: getGenres(show),
      rating: getRating(show.vote_average),
      voteAverage: show.vote_average,
      seasons: show.number_of_seasons,
      totalEpisodes: show.number_of_episodes,
      status: show.status
    };
  }
});

export const getSeasonDetails = action({
  args: { tmdbId: v.string(), seasonNumber: v.number() },
  handler: async (_ctx, { tmdbId, seasonNumber }) => {
    const data = await get<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
    if (!data) return null;
    return {
      seasonNumber: data.season_number,
      name: data.name,
      overview: data.overview,
      posterUrl: getPosterUrl(data.poster_path),
      airDate: data.air_date ?? undefined,
      episodes: (data.episodes ?? []).map((ep) => ({
        episodeNumber: ep.episode_number,
        name: ep.name,
        overview: ep.overview,
        stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
        airDate: ep.air_date ?? undefined,
        runtime: ep.runtime ?? undefined,
        voteAverage: ep.vote_average
      }))
    };
  }
});

export const getTrendingMovies = action({
  args: { page: v.optional(v.number()) },
  handler: async (_ctx, { page = 1 }) => {
    const data = await get<{ results: TMDBMovieListItem[] }>(`/trending/movie/week`, {
      page: String(page)
    });
    if (!data?.results) return [];
    return data.results.slice(0, 20).map((movie) => ({
      tmdbId: movie.id,
      title: movie.title,
      description: movie.overview || "No description available",
      posterUrl: getPosterUrl(movie.poster_path),
      backdropUrl: getBackdropUrl(movie.backdrop_path),
      year: getYear(movie.release_date),
      genre: getGenres(movie),
      rating: getRating(movie.vote_average),
      voteAverage: movie.vote_average
    }));
  }
});

export const getPopularTVShows = action({
  args: { page: v.optional(v.number()) },
  handler: async (_ctx, { page = 1 }) => {
    const data = await get<{ results: TMDBTVListItem[] }>(`/tv/popular`, {
      page: String(page)
    });
    if (!data?.results) return [];
    const top = data.results.slice(0, 20);
    return await mapInBatches(top, 5, async (show) => {
      const details = await get<TMDBTVDetails>(`/tv/${show.id}`, {
        append_to_response: "external_ids"
      });
      return {
        tmdbId: show.id,
        title: show.name,
        description: details?.overview || show.overview || "No description available",
        posterUrl: getPosterUrl(details?.poster_path ?? show.poster_path),
        backdropUrl: getBackdropUrl(details?.backdrop_path ?? show.backdrop_path),
        year: getYear(details?.first_air_date ?? show.first_air_date),
        genre: getGenres(details || show),
        rating: getRating(details?.vote_average ?? show.vote_average),
        seasons: details?.number_of_seasons,
        imdbId: details?.external_ids?.imdb_id,
        voteAverage: show.vote_average
      };
    });
  }
});

// ─── Internal Sync ────────────────────────────────────────────────────────────

type SyncType = "movies" | "tv";
type SyncFlags = { trending: boolean; popular: boolean; new: boolean; featured: boolean };

function getEmptyFlags(): SyncFlags {
  return { trending: false, popular: false, new: false, featured: false };
}

function mergeFlags(a: SyncFlags, b: Partial<SyncFlags>): SyncFlags {
  return {
    trending: a.trending || !!b.trending,
    popular: a.popular || !!b.popular,
    new: a.new || !!b.new,
    featured: a.featured || !!b.featured
  };
}

async function collectFlagMap(type: SyncType, pages: number): Promise<Map<number, SyncFlags>> {
  const merged = new Map<number, SyncFlags>();
  const sources =
    type === "movies"
      ? [
          {
            ep: "/trending/movie/week",
            flags: { trending: true, featured: true } as Partial<SyncFlags>
          },
          { ep: "/movie/popular", flags: { popular: true } as Partial<SyncFlags> },
          { ep: "/movie/now_playing", flags: { new: true } as Partial<SyncFlags> },
          { ep: "/movie/top_rated", flags: {} as Partial<SyncFlags> }
        ]
      : [
          {
            ep: "/trending/tv/week",
            flags: { trending: true, featured: true } as Partial<SyncFlags>
          },
          { ep: "/tv/popular", flags: { popular: true } as Partial<SyncFlags> },
          { ep: "/tv/on_the_air", flags: { new: true } as Partial<SyncFlags> },
          { ep: "/tv/top_rated", flags: {} as Partial<SyncFlags> }
        ];

  for (const src of sources) {
    for (let p = 1; p <= pages; p++) {
      const data = await get<TMDBListResponse<TMDBListItem>>(`${src.ep}`, {
        page: String(p)
      });
      if (!data?.results?.length) break;
      for (const item of data.results) {
        merged.set(item.id, mergeFlags(merged.get(item.id) ?? getEmptyFlags(), src.flags));
      }
    }
  }
  return merged;
}

function getCatalogEndpoint(type: SyncType, page: number): string {
  const base = `page=${page}&include_adult=false&sort_by=popularity.desc&vote_count.gte=25`;
  return type === "movies" ? `/discover/movie?${base}&include_video=false` : `/discover/tv?${base}`;
}

export const syncContent = action({
  args: {
    type: v.union(v.literal("movies"), v.literal("tv")),
    count: v.optional(v.number())
  },
  handler: async (ctx, { type, count = 50 }) => {
    const normalizedCount = Math.max(1, Math.min(count, 2000));
    const requiredPages = Math.ceil(normalizedCount / 20);
    const flagPages = Math.min(10, Math.ceil(requiredPages / 4) + 2);
    const flagMap = await collectFlagMap(type, flagPages);

    const existingContent = await ctx.runQuery(internal.content.getAllTmdbIds, {});
    const existingTmdbIds = new Set(
      existingContent.map((c: { tmdbId?: string }) => c.tmdbId).filter(Boolean)
    );

    const seeds: Array<{
      id: number;
      type: "movie" | "tv";
      title: string;
      overview: string;
      posterPath: string | null;
      backdropPath: string | null;
      releaseDate?: string;
      firstAirDate?: string;
      voteAverage: number;
      voteCount: number;
      popularity: number;
      genreIds: number[];
      originalLanguage: string;
      flags: SyncFlags;
      order: number;
    }> = [];

    let page = 1;
    const maxPages = Math.max(requiredPages, 50);

    while (seeds.length < normalizedCount && page <= maxPages) {
      const data = await get<TMDBListResponse<TMDBListItem>>(getCatalogEndpoint(type, page));
      if (!data?.results?.length) break;

      for (const item of data.results) {
        if (existingTmdbIds.has(String(item.id))) continue;

        const isMovie = "title" in item;
        seeds.push({
          id: item.id,
          type: isMovie ? "movie" : "tv",
          title: isMovie ? (item as TMDBMovieListItem).title : (item as TMDBTVListItem).name,
          overview: item.overview,
          posterPath: item.poster_path,
          backdropPath: item.backdrop_path,
          releaseDate: isMovie ? (item as TMDBMovieListItem).release_date : undefined,
          firstAirDate: !isMovie ? (item as TMDBTVListItem).first_air_date : undefined,
          voteAverage: item.vote_average,
          voteCount: item.vote_count ?? 0,
          popularity: item.popularity ?? 0,
          genreIds: item.genre_ids ?? [],
          originalLanguage: (item as any).original_language ?? "en",
          flags: flagMap.get(item.id) ?? getEmptyFlags(),
          order: seeds.length
        });

        if (seeds.length >= normalizedCount) break;
      }

      page++;

      if (page > maxPages && seeds.length === 0) break;
    }

    const now = Date.now();
    const detailLimit = Math.min(120, Math.ceil(seeds.length * 0.2));

    const payloads = await mapInBatches(seeds, 5, async (seed, index) => {
      const wantsDetails =
        index < detailLimit || seed.flags.trending || seed.flags.popular || seed.flags.featured;

      let details: TMDBMovieDetails | TMDBTVDetails | null = null;
      if (wantsDetails) {
        details = await get<TMDBMovieDetails | TMDBTVDetails>(
          seed.type === "movie" ? `/movie/${seed.id}` : `/tv/${seed.id}`,
          { append_to_response: "external_ids,videos,images" }
        );
      }

      const md = details as TMDBMovieDetails | null;
      const td = details as TMDBTVDetails | null;

      const logos = seed.type === "movie" ? md?.images?.logos : td?.images?.logos;
      const videos = seed.type === "movie" ? md?.videos?.results : td?.videos?.results;

      return {
        title: (seed.type === "movie" ? md?.title : td?.name) ?? seed.title,
        description: details?.overview ?? seed.overview ?? "No description available",
        type: seed.type,
        genre: getGenres(details ?? { genre_ids: seed.genreIds }),
        year: getYear(
          seed.type === "movie"
            ? (md?.release_date ?? seed.releaseDate)
            : (td?.first_air_date ?? seed.firstAirDate)
        ),
        rating: getRating(details?.vote_average ?? seed.voteAverage),
        voteAverage: details?.vote_average ?? seed.voteAverage,
        voteCount: details?.vote_count ?? seed.voteCount,
        popularity: details?.popularity ?? seed.popularity,
        posterUrl: getPosterUrl(details?.poster_path ?? seed.posterPath),
        backdropUrl: getBackdropUrl(details?.backdrop_path ?? seed.backdropPath),
        logoUrl: getLogoUrl(logos),
        trailerKey: getTrailerKey(videos),
        tmdbId: String(seed.id),
        imdbId:
          seed.type === "movie"
            ? (md?.imdb_id ?? md?.external_ids?.imdb_id)
            : td?.external_ids?.imdb_id,
        duration:
          seed.type === "movie"
            ? formatRuntime(md?.runtime)
            : formatRuntime(td?.episode_run_time?.[0]),
        seasons: seed.type === "tv" ? td?.number_of_seasons : undefined,
        totalEpisodes: seed.type === "tv" ? td?.number_of_episodes : undefined,
        status: seed.type === "movie" ? md?.status : td?.status,
        tagline: seed.type === "movie" ? md?.tagline || undefined : td?.tagline || undefined,
        originalLanguage: seed.originalLanguage,
        productionCountries: details?.production_countries?.map((c) => c.name),
        spokenLanguages: details?.spoken_languages?.map((l) => l.name),
        budget: seed.type === "movie" ? md?.budget : undefined,
        revenue: seed.type === "movie" ? md?.revenue : undefined,
        trending: seed.flags.trending,
        popular: seed.flags.popular || seed.order < 60,
        new: seed.flags.new,
        featured: false,
        createdAt: now,
        updatedAt: now,
        _order: seed.order,
        _hasBackdrop: Boolean(details?.backdrop_path ?? seed.backdropPath),
        _priority:
          Number(seed.flags.featured) + Number(seed.flags.trending) + Number(seed.flags.popular)
      };
    });

    const featuredIdx = payloads.findIndex(
      (p) => p._hasBackdrop && (p._priority > 0 || p._order === 0)
    );

    const items = payloads.map(({ _order, _hasBackdrop, _priority, ...item }, i) => ({
      ...item,
      featured: i === featuredIdx
    }));

    let synced = 0;
    for (let i = 0; i < items.length; i += 50) {
      synced += await ctx.runMutation(internal.content.upsertBatchFromTMDB, {
        items: items.slice(i, i + 50)
      });
    }

    return synced;
  }
});

export const syncSeasons = action({
  args: { tmdbId: v.string(), contentId: v.string(), totalSeasons: v.number() },
  handler: async (ctx, { tmdbId, contentId, totalSeasons }) => {
    let synced = 0;
    for (let s = 1; s <= Math.min(totalSeasons, 20); s++) {
      const data = await get<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${s}`);
      if (!data) continue;

      await ctx.runMutation(internal.seasons.upsertSeason, {
        contentId: contentId as any,
        tmdbId,
        seasonNumber: data.season_number,
        name: data.name,
        overview: data.overview || undefined,
        posterUrl: data.poster_path ? getPosterUrl(data.poster_path) : undefined,
        airDate: data.air_date ?? undefined,
        episodeCount: data.episodes?.length ?? 0,
        episodes: (data.episodes ?? []).map((ep) => ({
          episodeNumber: ep.episode_number,
          name: ep.name,
          overview: ep.overview || undefined,
          stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
          airDate: ep.air_date ?? undefined,
          runtime: ep.runtime ?? undefined,
          voteAverage: ep.vote_average
        }))
      });
      synced++;
    }
    return synced;
  }
});

// ─── IMDb Scraper ────────────────────────────────────────────

interface IMDbMetadata {
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
}

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15"
];

function getRandomUserAgent(): string {
  return userAgents[Math.floor(Math.random() * userAgents.length)] ?? userAgents[0]!;
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export const getIMDbMetadata = action({
  args: { imdbId: v.string(), type: v.optional(v.union(v.literal("movie"), v.literal("tv"))) },
  handler: async (_ctx, { imdbId, type }): Promise<IMDbMetadata | null> => {
    try {
      const trailerResponse = await fetch(
        `https://fed-trailers.pstream.mov/${type === "movie" ? "movie" : "tv"}/${imdbId}`
      );
      if (trailerResponse.ok) {
        const trailerData = await trailerResponse.json();
        if (trailerData.trailer?.embed_url) {
          return { trailer_url: trailerData.trailer.embed_url };
        }
      }
    } catch {}

    try {
      const delay = Math.floor(Math.random() * (197 - 69) + 69);
      await new Promise((r) => setTimeout(r, delay));

      const url = `https://www.imdb.com/title/${imdbId}/`;
      const res = await fetchWithTimeout(
        url,
        {
          headers: {
            "User-Agent": getRandomUserAgent(),
            Accept: "text/html",
            "Accept-Language": "en-US,en;q=0.9"
          }
        },
        10000
      );

      if (!res.ok) return null;

      const html = await res.text();

      const jsonLdMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
      if (jsonLdMatch?.[1]) {
        try {
          const jsonLd = JSON.parse(jsonLdMatch[1]);
          return {
            title: jsonLd.name,
            year: jsonLd.datePublished ? parseInt(jsonLd.datePublished.split("-")[0]) : null,
            runtime: jsonLd.duration ? parseInt(jsonLd.duration.replace(/[^0-9]/g, "")) : null,
            age_rating: jsonLd.contentRating,
            imdb_rating: jsonLd.aggregateRating?.ratingValue
              ? parseFloat(jsonLd.aggregateRating.ratingValue)
              : null,
            votes: jsonLd.aggregateRating?.reviewCount
              ? parseInt(jsonLd.aggregateRating.reviewCount.replace(/,/g, ""))
              : null,
            plot: jsonLd.description,
            poster_url: jsonLd.image,
            genre: jsonLd.genre
              ? Array.isArray(jsonLd.genre)
                ? jsonLd.genre
                : [jsonLd.genre]
              : [],
            cast: jsonLd.actor?.map((a: any) => a.name).slice(0, 10),
            directors: jsonLd.director?.map((d: any) => d.name)
          };
        } catch {}
      }

      return null;
    } catch {
      return null;
    }
  }
});

// ─── Additional TMDB Features  ────────────────────────────────

export const getCredits = action({
  args: { tmdbId: v.number(), type: v.union(v.literal("movie"), v.literal("tv")) },
  handler: async (_ctx, { tmdbId, type }) => {
    const endpoint = type === "movie" ? `/movie/${tmdbId}/credits` : `/tv/${tmdbId}/credits`;
    const data = await get<{
      cast: Array<{
        id: number;
        name: string;
        character: string;
        profile_path: string | null;
        order: number;
      }>;
      crew: Array<{ id: number; name: string; job: string; department: string }>;
    }>(endpoint);

    if (!data) return null;

    return {
      cast: data.cast.slice(0, 20).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profileUrl: c.profile_path ? `${TMDB_IMAGE_BASE}/w185${c.profile_path}` : undefined,
        order: c.order
      })),
      directors: data.crew.filter((c) => c.job === "Director").map((c) => c.name),
      writers: data.crew
        .filter((c) => c.job === "Writer" || c.job === "Screenplay")
        .map((c) => c.name)
    };
  }
});

export const getVideos = action({
  args: { tmdbId: v.number(), type: v.union(v.literal("movie"), v.literal("tv")) },
  handler: async (_ctx, { tmdbId, type }) => {
    const endpoint = type === "movie" ? `/movie/${tmdbId}/videos` : `/tv/${tmdbId}/videos`;
    const data = await get<{ results: TMDBVideo[] }>(endpoint);

    if (!data?.results) return [];

    return data.results
      .filter((v) => v.site === "YouTube" && (v.type === "Trailer" || v.type === "Teaser"))
      .map((v) => ({
        key: v.key,
        name: v.name,
        type: v.type,
        official: v.official
      }));
  }
});

export const getRelated = action({
  args: {
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv")),
    limit: v.optional(v.number())
  },
  handler: async (_ctx, { tmdbId, type, limit = 10 }) => {
    const endpoint =
      type === "movie" ? `/movie/${tmdbId}/recommendations` : `/tv/${tmdbId}/recommendations`;
    const data = await get<{ results: TMDBListItem[] }>(endpoint);

    if (!data?.results) return [];

    return data.results.slice(0, limit).map((item) => {
      const isMovie = "title" in item;
      return {
        tmdbId: item.id,
        title: isMovie ? item.title : item.name,
        type: isMovie ? "movie" : "tv",
        posterUrl: getPosterUrl(item.poster_path),
        backdropUrl: getBackdropUrl(item.backdrop_path),
        year: getYear(isMovie ? item.release_date : item.first_air_date),
        voteAverage: item.vote_average,
        genre: getGenres(item),
        description: item.overview || "No description available",
        rating: getRating(item.vote_average),
        popularity: item.popularity
      };
    });
  }
});

export const syncSingleContent = action({
  args: {
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv"))
  },
  handler: async (ctx, { tmdbId, type }) => {
    const existing = await ctx.runQuery(internal.content.getAllTmdbIds, {});
    const existingTmdbIds = new Set(
      existing.map((c: { tmdbId?: string }) => c.tmdbId).filter(Boolean)
    );

    if (existingTmdbIds.has(String(tmdbId))) {
      return { alreadyExists: true, tmdbId: String(tmdbId) };
    }

    const details = await get<TMDBMovieDetails | TMDBTVDetails>(
      type === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`,
      { append_to_response: "external_ids,videos,images" }
    );

    if (!details) return null;

    const md = details as TMDBMovieDetails | null;
    const td = details as TMDBTVDetails | null;

    const now = Date.now();
    const item = {
      title: (type === "movie" ? md?.title : td?.name) || "Unknown Title",
      description: details.overview || "No description available",
      type,
      genre: getGenres(details),
      year: getYear(type === "movie" ? md?.release_date : td?.first_air_date),
      rating: getRating(details.vote_average),
      voteAverage: details.vote_average,
      voteCount: details.vote_count,
      popularity: details.popularity,
      posterUrl: getPosterUrl(details.poster_path),
      backdropUrl: getBackdropUrl(details.backdrop_path),
      logoUrl: getLogoUrl(type === "movie" ? md?.images?.logos : td?.images?.logos),
      trailerKey: getTrailerKey(type === "movie" ? md?.videos?.results : td?.videos?.results),
      tmdbId: String(tmdbId),
      imdbId:
        type === "movie" ? md?.imdb_id || md?.external_ids?.imdb_id : td?.external_ids?.imdb_id,
      duration:
        type === "movie" ? formatRuntime(md?.runtime) : formatRuntime(td?.episode_run_time?.[0]),
      seasons: type === "tv" ? td?.number_of_seasons : undefined,
      totalEpisodes: type === "tv" ? td?.number_of_episodes : undefined,
      status: type === "movie" ? md?.status : td?.status,
      tagline: details.tagline || undefined,
      originalLanguage: details.original_language,
      productionCountries: details.production_countries?.map((c) => c.name),
      spokenLanguages: details.spoken_languages?.map((l) => l.name),
      budget: type === "movie" ? md?.budget : undefined,
      revenue: type === "movie" ? md?.revenue : undefined,
      trending: false,
      popular: false,
      featured: false,
      new: false,
      createdAt: now,
      updatedAt: now
    };

    await ctx.runMutation(internal.content.upsertBatchFromTMDB, { items: [item] });

    return { alreadyExists: false, tmdbId: String(tmdbId) };
  }
});

export const findByExternalId = action({
  args: { imdbId: v.string() },
  handler: async (_ctx, { imdbId }) => {
    const data = await get<{
      movie_results: Array<{ id: number; title: string }>;
      tv_results: Array<{ id: number; name: string }>;
    }>(`/find/${imdbId}`, { external_source: "imdb_id" });

    if (data?.movie_results?.[0]) {
      return { type: "movie" as const, tmdbId: data.movie_results[0].id };
    }
    if (data?.tv_results?.[0]) {
      return { type: "tv" as const, tmdbId: data.tv_results[0].id };
    }
    return null;
  }
});

export const getLogo = action({
  args: { tmdbId: v.number(), type: v.union(v.literal("movie"), v.literal("tv")) },
  handler: async (_ctx, { tmdbId, type }) => {
    const endpoint = type === "movie" ? `/movie/${tmdbId}/images` : `/tv/${tmdbId}/images`;
    const data = await get<{ logos?: TMDBLogo[] }>(endpoint, {
      include_image_language: "en,null"
    });

    if (!data?.logos?.length) return undefined;

    const enLogo = data.logos
      .filter((l) => l.iso_639_1 === "en")
      .sort((a, b) => b.vote_average - a.vote_average)[0];

    const bestLogo = enLogo || data.logos.sort((a, b) => b.vote_average - a.vote_average)[0];

    return bestLogo ? `${TMDB_IMAGE_BASE}/original${bestLogo.file_path}` : undefined;
  }
});
