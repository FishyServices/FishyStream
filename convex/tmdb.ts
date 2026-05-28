"use node";
import { v } from "convex/values";
import { action, query, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import {
  getCanonicalSeasonCount,
  getCanonicalTotalEpisodes,
  getTvOrderingOverride
} from "../shared/tvSeasonMappings";
import { resolveAniListEpisodeAddress, resolveAniListId } from "../shared/anilistResolver";
import type { AniListEpisodeMapping } from "../shared/contentMetadata";

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

interface CanonicalSeasonPayload {
  seasonNumber: number;
  name: string;
  overview?: string;
  posterUrl?: string;
  airDate?: string;
  episodeCount: number;
  year?: number;
  episodes: Array<{
    episodeNumber: number;
    name: string;
    overview?: string;
    stillUrl?: string;
    airDate?: string;
    runtime?: number;
    voteAverage: number;
  }>;
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

function getRating(voteAverage: number, certificationOrRating?: string | null): string {
  if (certificationOrRating) {
    const r = certificationOrRating.trim().toUpperCase();
    const known = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"];
    if (known.includes(r)) return r;
    if (r === "U" || r === "U/A") return "PG";
    if (r === "A") return "R";
    if (r === "18" || r === "18+") return "R";
    if (r === "15" || r === "16+") return "PG-13";
    if (r === "12" || r === "12A" || r === "13+") return "PG-13";
  }
  if (voteAverage >= 7.5) return "PG-13";
  if (voteAverage >= 5) return "PG";
  return "G";
}

function isAnimeLikeContent(args: {
  type: "movie" | "tv";
  genres: string[];
  originalLanguage?: string;
}) {
  if (args.type !== "tv") return false;
  return (
    args.originalLanguage?.toLowerCase() === "ja" &&
    args.genres.some((genre) => genre.toLowerCase() === "animation")
  );
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

function mapTmdbSeasonToCanonicalPayload(
  data: TMDBSeasonDetails,
  seasonNumber: number
): CanonicalSeasonPayload {
  return {
    seasonNumber,
    name: data.name,
    overview: data.overview || undefined,
    posterUrl: data.poster_path ? getPosterUrl(data.poster_path) : undefined,
    airDate: data.air_date ?? undefined,
    episodeCount: data.episodes?.length ?? 0,
    year: getYear(data.air_date ?? undefined),
    episodes: (data.episodes ?? []).map((ep) => ({
      episodeNumber: ep.episode_number,
      name: ep.name,
      overview: ep.overview || undefined,
      stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
      airDate: ep.air_date ?? undefined,
      runtime: ep.runtime ?? undefined,
      voteAverage: ep.vote_average
    }))
  };
}

function hasEpisodes(data: TMDBSeasonDetails | null): data is TMDBSeasonDetails {
  return (data?.episodes?.length ?? 0) > 0;
}

async function buildAniListEpisodeMappings(args: {
  anilistId?: string | null;
  title?: string;
  season: number;
  seasonTitle?: string;
  year?: number;
  episodes: Array<{ episodeNumber: number }>;
}): Promise<AniListEpisodeMapping[] | undefined> {
  if (!args.anilistId || args.episodes.length === 0) return undefined;

  const mappings = await Promise.all(
    args.episodes.map(async (episode) => {
      const address = await resolveAniListEpisodeAddress({
        anilistId: args.anilistId,
        title: args.title,
        season: args.season,
        seasonTitle: args.seasonTitle,
        year: args.year,
        episode: episode.episodeNumber
      });

      return address
        ? {
            episodeNumber: episode.episodeNumber,
            anilistId: address.anilistId,
            anilistEpisodeNumber: address.episode
          }
        : null;
    })
  );

  const validMappings = mappings.filter((mapping): mapping is AniListEpisodeMapping => !!mapping);
  return validMappings.length > 0 ? validMappings : undefined;
}

async function buildCanonicalSeasonPayload(
  tmdbId: string,
  seasonNumber: number,
  override = getTvOrderingOverride(tmdbId)
): Promise<CanonicalSeasonPayload | null> {
  const seasonDef = override?.canonicalSeasons.find((entry) => entry.seasonNumber === seasonNumber);
  if (!seasonDef) {
    const data = await get<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
    if (!data) return null;
    return mapTmdbSeasonToCanonicalPayload(data, data.season_number);
  }

  const data = await get<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${seasonDef.sourceSeason}`);
  if (!data) return null;

  const startIndex = Math.max(0, seasonDef.sourceEpisodeStart - 1);
  let sourceData = data;
  let slicedEpisodes = (sourceData.episodes ?? []).slice(
    startIndex,
    startIndex + seasonDef.episodeCount
  );

  if (slicedEpisodes.length === 0 && seasonDef.sourceSeason !== seasonNumber) {
    const directSeasonData = await get<TMDBSeasonDetails>(`/tv/${tmdbId}/season/${seasonNumber}`);
    if (hasEpisodes(directSeasonData)) {
      sourceData = directSeasonData;
      slicedEpisodes = sourceData.episodes.slice(0, seasonDef.episodeCount);
    }
  }

  if (slicedEpisodes.length === 0) return null;

  const airDate = slicedEpisodes[0]?.air_date ?? sourceData.air_date ?? undefined;
  const usesSplitCanonicalSeason =
    seasonDef.sourceSeason !== seasonDef.seasonNumber || seasonDef.sourceEpisodeStart !== 1;

  return {
    seasonNumber,
    name: usesSplitCanonicalSeason ? `Season ${seasonNumber}` : sourceData.name,
    overview: sourceData.overview || undefined,
    posterUrl: sourceData.poster_path ? getPosterUrl(sourceData.poster_path) : undefined,
    airDate,
    episodeCount: slicedEpisodes.length,
    year: getYear(airDate),
    episodes: slicedEpisodes.map((ep, index) => ({
      episodeNumber: index + 1,
      name: ep.name,
      overview: ep.overview || undefined,
      stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
      airDate: ep.air_date ?? undefined,
      runtime: ep.runtime ?? undefined,
      voteAverage: ep.vote_average
    }))
  };
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
        posterUrl: getPosterUrl(movie.poster_path),
        year: getYear(movie.release_date),
        genre: getGenres(movie),
        rating: getRating(movie.vote_average),
        voteAverage: movie.vote_average
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
    return sorted.map((show) => {
      return {
        tmdbId: show.id,
        title: show.name,
        posterUrl: getPosterUrl(show.poster_path),
        year: getYear(show.first_air_date),
        genre: getGenres(show),
        rating: getRating(show.vote_average),
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
      const genres = getGenres(details ?? { genre_ids: seed.genreIds });
      const originalLanguage = details?.original_language ?? seed.originalLanguage;
      const animeLike = isAnimeLikeContent({
        type: seed.type,
        genres,
        originalLanguage
      });
      const resolvedAniListId = animeLike
        ? await resolveAniListId({
            title: seed.title,
            season: 1,
            year: getYear(seed.releaseDate ?? seed.firstAirDate)
          })
        : null;

      const logos = seed.type === "movie" ? md?.images?.logos : td?.images?.logos;
      const videos = seed.type === "movie" ? md?.videos?.results : td?.videos?.results;

      return {
        title: (seed.type === "movie" ? md?.title : td?.name) ?? seed.title,
        description: details?.overview ?? seed.overview ?? "No description available",
        type: seed.type,
        genre: genres,
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
        anilistId: resolvedAniListId ?? undefined,
        imdbId:
          (seed.type === "movie"
            ? (md?.imdb_id ?? md?.external_ids?.imdb_id)
            : td?.external_ids?.imdb_id) || undefined,
        duration:
          seed.type === "movie"
            ? formatRuntime(md?.runtime)
            : formatRuntime(td?.episode_run_time?.[0]),
        seasons:
          seed.type === "tv" ? getCanonicalSeasonCount(seed.id, td?.number_of_seasons) : undefined,
        totalEpisodes:
          seed.type === "tv"
            ? getCanonicalTotalEpisodes(seed.id, td?.number_of_episodes)
            : undefined,
        status: seed.type === "movie" ? md?.status : td?.status,
        tagline: seed.type === "movie" ? md?.tagline || undefined : td?.tagline || undefined,
        originalLanguage,
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

export const backfillAniListIds = action({
  args: { limit: v.optional(v.number()) },
  handler: async (
    ctx,
    { limit = 100 }
  ): Promise<{
    scanned: number;
    updated: number;
  }> => {
    const candidates: Array<{
      id: string;
      tmdbId?: string;
      title: string;
      year: number;
    }> = await ctx.runQuery(internal.content.getAnimeMissingAniListIds, { limit });
    let updated = 0;

    for (const candidate of candidates) {
      if (!candidate.tmdbId) continue;

      const anilistId = await resolveAniListId({
        title: candidate.title,
        season: 1,
        year: candidate.year
      });

      if (!anilistId) continue;

      await ctx.runMutation(internal.content.setAniListId, {
        id: candidate.id as any,
        anilistId
      });
      updated++;
    }

    return { scanned: candidates.length, updated };
  }
});

export const syncSeasons = action({
  args: { tmdbId: v.string(), contentId: v.string(), totalSeasons: v.number() },
  handler: async (ctx, { tmdbId, contentId, totalSeasons }) => {
    const content = await ctx.runQuery(api.content.getContentSyncContextById, {
      id: contentId as any
    });
    const contentTitle = content?.title;
    const override = getTvOrderingOverride(tmdbId);
    if (override?.episodeGroupId) {
      const groupData = await get<{
        groups: Array<{
          order: number;
          name: string;
          episodes: Array<{
            air_date: string | null;
            name: string;
            overview: string;
            runtime: number | null;
            still_path: string | null;
            vote_average: number;
          }>;
        }>;
      }>(`/tv/episode_group/${override.episodeGroupId}`);

      if (groupData?.groups?.length) {
        let groupSynced = 0;
        for (const group of groupData.groups.slice(0, override.canonicalSeasonCount)) {
          const resolvedAniListId = await resolveAniListId({
            title: contentTitle,
            season: Math.max(1, group.order),
            seasonTitle: group.name,
            year: getYear(group.episodes[0]?.air_date ?? undefined)
          });
          const episodes = group.episodes.map((ep, index) => ({
            episodeNumber: index + 1,
            name: ep.name,
            overview: ep.overview || undefined,
            stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
            airDate: ep.air_date ?? undefined,
            runtime: ep.runtime ?? undefined,
            voteAverage: ep.vote_average
          }));
          const anilistEpisodeMappings = await buildAniListEpisodeMappings({
            anilistId: resolvedAniListId,
            title: contentTitle,
            season: Math.max(1, group.order),
            seasonTitle: group.name,
            year: getYear(group.episodes[0]?.air_date ?? undefined),
            episodes
          });
          await ctx.runMutation(internal.seasons.upsertSeason, {
            contentId: contentId as any,
            tmdbId,
            anilistId: resolvedAniListId ?? undefined,
            anilistEpisodeMappings,
            seasonNumber: Math.max(1, group.order),
            name: group.name,
            overview: undefined,
            posterUrl: undefined,
            airDate: group.episodes[0]?.air_date ?? undefined,
            episodeCount: group.episodes.length,
            episodes
          });
          groupSynced++;
        }
        return groupSynced;
      }
    }

    let synced = 0;
    for (let s = 1; s <= Math.min(totalSeasons, 20); s++) {
      const payload = await buildCanonicalSeasonPayload(tmdbId, s, override);
      if (!payload) continue;
      const resolvedAniListId = await resolveAniListId({
        title: contentTitle,
        season: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year
      });
      const anilistEpisodeMappings = await buildAniListEpisodeMappings({
        anilistId: resolvedAniListId,
        title: contentTitle,
        season: payload.seasonNumber,
        seasonTitle: payload.name,
        year: payload.year,
        episodes: payload.episodes
      });

      await ctx.runMutation(internal.seasons.upsertSeason, {
        contentId: contentId as any,
        tmdbId,
        anilistId: resolvedAniListId ?? undefined,
        anilistEpisodeMappings,
        seasonNumber: payload.seasonNumber,
        name: payload.name,
        overview: payload.overview,
        posterUrl: payload.posterUrl,
        airDate: payload.airDate,
        episodeCount: payload.episodeCount,
        episodes: payload.episodes
      });
      synced++;
    }
    return synced;
  }
});

export const syncSeason = action({
  args: { tmdbId: v.string(), contentId: v.string(), seasonNumber: v.number() },
  handler: async (ctx, { tmdbId, contentId, seasonNumber }) => {
    const content = await ctx.runQuery(api.content.getContentSyncContextById, {
      id: contentId as any
    });
    const contentTitle = content?.title;
    const override = getTvOrderingOverride(tmdbId);
    if (override?.episodeGroupId) {
      const groupData = await get<{
        groups: Array<{
          order: number;
          name: string;
          episodes: Array<{
            air_date: string | null;
            name: string;
            overview: string;
            runtime: number | null;
            still_path: string | null;
            vote_average: number;
          }>;
        }>;
      }>(`/tv/episode_group/${override.episodeGroupId}`);

      const group = groupData?.groups?.find((entry) => Math.max(1, entry.order) === seasonNumber);
      if (!group) return null;
      const resolvedAniListId = await resolveAniListId({
        title: contentTitle,
        season: seasonNumber,
        seasonTitle: group.name,
        year: getYear(group.episodes[0]?.air_date ?? undefined)
      });
      const episodes = group.episodes.map((ep, index) => ({
        episodeNumber: index + 1,
        name: ep.name,
        overview: ep.overview || undefined,
        stillUrl: ep.still_path ? getStillUrl(ep.still_path) : undefined,
        airDate: ep.air_date ?? undefined,
        runtime: ep.runtime ?? undefined,
        voteAverage: ep.vote_average
      }));
      const anilistEpisodeMappings = await buildAniListEpisodeMappings({
        anilistId: resolvedAniListId,
        title: contentTitle,
        season: seasonNumber,
        seasonTitle: group.name,
        year: getYear(group.episodes[0]?.air_date ?? undefined),
        episodes
      });

      await ctx.runMutation(internal.seasons.upsertSeason, {
        contentId: contentId as any,
        tmdbId,
        anilistId: resolvedAniListId ?? undefined,
        anilistEpisodeMappings,
        seasonNumber,
        name: group.name,
        overview: undefined,
        posterUrl: undefined,
        airDate: group.episodes[0]?.air_date ?? undefined,
        episodeCount: group.episodes.length,
        episodes
      });

      return { seasonNumber, episodeCount: group.episodes.length };
    }

    const payload = await buildCanonicalSeasonPayload(tmdbId, seasonNumber, override);
    if (!payload) return null;
    const resolvedAniListId = await resolveAniListId({
      title: contentTitle,
      season: payload.seasonNumber,
      seasonTitle: payload.name,
      year: payload.year
    });
    const anilistEpisodeMappings = await buildAniListEpisodeMappings({
      anilistId: resolvedAniListId,
      title: contentTitle,
      season: payload.seasonNumber,
      seasonTitle: payload.name,
      year: payload.year,
      episodes: payload.episodes
    });

    await ctx.runMutation(internal.seasons.upsertSeason, {
      contentId: contentId as any,
      tmdbId,
      anilistId: resolvedAniListId ?? undefined,
      anilistEpisodeMappings,
      seasonNumber: payload.seasonNumber,
      name: payload.name,
      overview: payload.overview,
      posterUrl: payload.posterUrl,
      airDate: payload.airDate,
      episodeCount: payload.episodeCount,
      episodes: payload.episodes
    });

    return { seasonNumber: payload.seasonNumber, episodeCount: payload.episodeCount };
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
      directors: data.crew.filter((c) => c.job === "Director").map((c) => c.name)
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
        year: getYear(isMovie ? item.release_date : item.first_air_date),
        voteAverage: item.vote_average
      };
    });
  }
});

export const syncSingleContent = action({
  args: {
    tmdbId: v.number(),
    type: v.union(v.literal("movie"), v.literal("tv"))
  },
  handler: async (
    ctx,
    { tmdbId, type }
  ): Promise<{
    alreadyExists: boolean;
    tmdbId: string;
    seasons: number | undefined;
    totalEpisodes: number | undefined;
  } | null> => {
    const details = await get<TMDBMovieDetails | TMDBTVDetails>(
      type === "movie" ? `/movie/${tmdbId}` : `/tv/${tmdbId}`,
      { append_to_response: "external_ids,videos,images" }
    );

    if (!details) return null;

    const existing = await ctx.runQuery(internal.content.getSyncMetadataByTmdbId, {
      tmdbId: String(tmdbId)
    });

    const md = details as TMDBMovieDetails | null;
    const td = details as TMDBTVDetails | null;
    const genres = getGenres(details);
    const animeLike = isAnimeLikeContent({
      type,
      genres,
      originalLanguage: details.original_language
    });
    const resolvedAniListId = animeLike
      ? await resolveAniListId({
          title: type === "movie" ? md?.title : td?.name,
          season: 1,
          year: getYear(type === "movie" ? md?.release_date : td?.first_air_date)
        })
      : null;

    const now = Date.now();
    const item = {
      title: (type === "movie" ? md?.title : td?.name) || "Unknown Title",
      description: details.overview || "No description available",
      type,
      genre: genres,
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
      anilistId: resolvedAniListId ?? undefined,
      imdbId:
        (type === "movie" ? md?.imdb_id || md?.external_ids?.imdb_id : td?.external_ids?.imdb_id) ||
        undefined,
      duration:
        type === "movie" ? formatRuntime(md?.runtime) : formatRuntime(td?.episode_run_time?.[0]),
      seasons: type === "tv" ? getCanonicalSeasonCount(tmdbId, td?.number_of_seasons) : undefined,
      totalEpisodes:
        type === "tv" ? getCanonicalTotalEpisodes(tmdbId, td?.number_of_episodes) : undefined,
      status: type === "movie" ? md?.status : td?.status,
      tagline: details.tagline || undefined,
      originalLanguage: details.original_language,
      productionCountries: details.production_countries?.map((c) => c.name),
      spokenLanguages: details.spoken_languages?.map((l) => l.name),
      budget: type === "movie" ? md?.budget : undefined,
      revenue: type === "movie" ? md?.revenue : undefined,
      trending: existing ? existing.trending : false,
      popular: existing ? existing.popular : false,
      featured: existing ? existing.featured : false,
      new: existing ? existing.new : false,
      createdAt: now,
      updatedAt: now
    };

    await ctx.runMutation(internal.content.upsertBatchFromTMDB, { items: [item] });
    if (resolvedAniListId && existing?._id) {
      await ctx.runMutation(internal.content.setAniListId, {
        id: existing._id,
        anilistId: resolvedAniListId
      });
    }

    return {
      alreadyExists: false,
      tmdbId: String(tmdbId),
      seasons: item.seasons,
      totalEpisodes: item.totalEpisodes
    };
  }
});
