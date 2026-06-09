// ─── Constants ────────────────────────────────────────────────────────────────

export const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
export const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export const TMDB_BASE_URL_2 = "https://api.tmdb.org/3";
export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export const GENRE_MAP: Record<number, string> = {
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

export const TMDB_DISCOVER_GENRES: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  "science fiction": 878,
  "sci-fi": 878,
  thriller: 53,
  war: 10752,
  western: 37
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TMDBGenre {
  id: number;
  name: string;
}

export interface TMDBVideo {
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
}

export interface TMDBLogo {
  file_path: string;
  iso_639_1: string;
  vote_average: number;
}

export interface TMDBMovieListItem {
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

export interface TMDBTVListItem {
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

export interface TMDBMovieDetails extends TMDBMovieListItem {
  genres?: TMDBGenre[];
  runtime?: number;
  imdb_id?: string;
  status?: string;
  tagline?: string;
  videos?: { results: TMDBVideo[] };
  images?: { logos?: TMDBLogo[] };
  external_ids?: { imdb_id?: string };
}

export interface TMDBTVDetails extends TMDBTVListItem {
  genres?: TMDBGenre[];
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  status?: string;
  tagline?: string;
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

export interface TMDBEpisode {
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string | null;
  runtime: number | null;
  vote_average: number;
}

export interface TMDBSeasonDetails {
  season_number: number;
  name: string;
  overview: string;
  poster_path: string | null;
  air_date: string | null;
  episodes: TMDBEpisode[];
}

export type TMDBListItem = TMDBMovieListItem | TMDBTVListItem;

export interface TMDBListResponse<T> {
  page: number;
  total_pages: number;
  results: T[];
}

export interface CanonicalSeasonPayload {
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

export type CompactEpisode = {
  episodeNumber: number;
  name: string;
  stillUrl?: string;
  runtime?: number;
  voteAverage: number;
};

// ─── Image / URL helpers ──────────────────────────────────────────────────────

export function getPosterUrl(path: string | null, size = "w500"): string {
  if (!path) return "https://placehold.co/500x750/1a1a2e/666?text=No+Poster";
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function getBackdropUrl(path: string | null): string {
  if (!path) return "https://placehold.co/1920x1080/0a0a12/333?text=No+Backdrop";
  return `${TMDB_IMAGE_BASE}/original${path}`;
}

export function getStillUrl(path: string | null): string {
  if (!path) return "";
  return `${TMDB_IMAGE_BASE}/w500${path}`;
}

export function getProfileUrl(path: string | null): string {
  if (!path) return "";
  return `${TMDB_IMAGE_BASE}/w185${path}`;
}

// ─── Metadata helpers ─────────────────────────────────────────────────────────

export function getGenres(item: {
  genres?: Array<{ id: number; name: string }>;
  genre_ids?: number[];
}): string[] {
  if (item.genres?.length) return item.genres.map((g) => g.name);
  return (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean) as string[];
}

export function getYear(date?: string): number {
  if (!date) return new Date().getFullYear();
  const year = parseInt(date.split("-")[0] ?? String(new Date().getFullYear()));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

export function getRating(voteAverage: number, certificationOrRating?: string | null): string {
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

export function getLogoUrl(logos: TMDBLogo[] | undefined): string | undefined {
  if (!logos?.length) return undefined;
  const en = logos
    .filter((l) => l.iso_639_1 === "en")
    .sort((a, b) => b.vote_average - a.vote_average)[0];
  const best = en ?? logos.sort((a, b) => b.vote_average - a.vote_average)[0];
  if (!best) return undefined;
  return `${TMDB_IMAGE_BASE}/w500${best.file_path}`;
}

export function getTrailerKey(videos: TMDBVideo[] | undefined): string | undefined {
  if (!videos?.length) return undefined;
  const priority = ["Official Trailer", "Trailer", "Teaser", "Clip", "Featurette"];
  for (const type of priority) {
    const v = videos.find((v) => v.site === "YouTube" && v.type === type && v.official);
    if (v) return v.key;
  }
  return videos.find((v) => v.site === "YouTube" && v.type === "Trailer")?.key;
}

export function isAnimeLikeContent(args: {
  type: "movie" | "tv";
  genres: string[];
  originalLanguage?: string;
}): boolean {
  if (args.type !== "tv") return false;
  return (
    args.originalLanguage?.toLowerCase() === "ja" &&
    args.genres.some((g) => g.toLowerCase() === "animation")
  );
}

export function formatRuntime(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  return items
    .map((item, index) => {
      const score = Math.sin((index + 1) * 999 + seed * 9973) * 10000;
      return { item, score: score - Math.floor(score) };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

export async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((item, bi) => fn(item, i + bi)));
    out.push(...results);
  }
  return out;
}

// ─── Season payload helpers ───────────────────────────────────────────────────

export function mapTmdbSeasonToCanonicalPayload(
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

export function compactSeasonEpisodesForDb(
  episodes: CanonicalSeasonPayload["episodes"]
): CompactEpisode[] {
  return episodes.map((ep) => ({
    episodeNumber: ep.episodeNumber,
    name: ep.name,
    stillUrl: ep.stillUrl,
    runtime: ep.runtime,
    voteAverage: ep.voteAverage
  }));
}

export function hasEpisodes(data: TMDBSeasonDetails | null): data is TMDBSeasonDetails {
  return (data?.episodes?.length ?? 0) > 0;
}

// ─── Server-side  ───────────────────────────

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

class SimpleCache<K, V> {
  private store = new Map<string, CacheEntry<V>>();
  private keySerializer: (key: K) => string;

  constructor(keySerializer?: (key: K) => string) {
    this.keySerializer = keySerializer ?? ((k) => JSON.stringify(k));
  }

  get(key: K): V | undefined {
    const s = this.keySerializer(key);
    const entry = this.store.get(s);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.store.delete(s);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlSeconds: number): void {
    this.store.set(this.keySerializer(key), {
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

const _serverCache = new SimpleCache<TMDBCacheKey, unknown>(
  (k) => `${k.url}|${JSON.stringify(k.params)}|${k.language}`
);

let _proxyIndex = 0;
function _nextProxy(proxyUrls: string[]): string | undefined {
  if (!proxyUrls.length) return undefined;
  return proxyUrls[_proxyIndex++ % proxyUrls.length];
}

function _isV4Token(key: string): boolean {
  return key.split(".").length === 3;
}

export async function tmdbGet<T>(
  endpoint: string,
  params: Record<string, string> = {},
  proxyUrls: string[] = []
): Promise<T | null> {
  const language = params.language ?? "en-US";
  const cacheKey: TMDBCacheKey = { url: endpoint, params, language };
  const cached = _serverCache.get(cacheKey);
  if (cached !== undefined) return cached as T;

  const apiKey = TMDB_API_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (_isV4Token(apiKey)) headers.Authorization = `Bearer ${apiKey}`;

  const allParams = {
    ...params,
    language,
    ...(!_isV4Token(apiKey) ? { api_key: apiKey } : {})
  };

  const buildUrl = (base: string) => {
    const url = new URL(base + endpoint);
    for (const [k, v] of Object.entries(allParams)) {
      if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
    }
    return url.toString();
  };

  let result: T | null = null;

  const proxy = _nextProxy(proxyUrls);
  if (proxy) {
    try {
      const res = await fetch(
        `${proxy}/?destination=${encodeURIComponent(buildUrl(TMDB_BASE_URL))}`,
        { headers, signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) result = (await res.json()) as T;
    } catch {
      /* fall through */
    }
  }

  if (!result) {
    try {
      const res = await fetch(buildUrl(TMDB_BASE_URL), {
        headers,
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) result = (await res.json()) as T;
    } catch {
      /* fall through */
    }
  }

  if (!result) {
    try {
      const res = await fetch(buildUrl(TMDB_BASE_URL_2), {
        headers,
        signal: AbortSignal.timeout(30000)
      });
      if (res.ok) result = (await res.json()) as T;
    } catch {
      return null;
    }
  }

  if (result) _serverCache.set(cacheKey, result, 3600);
  return result;
}

// ─── Browser-side fetch helpers ───────────────────────────────────────────────

export function buildTmdbUrl(
  path: string,
  apiKey: string,
  params: Record<string, string | number | undefined> = {}
): string {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("language", "en-US");
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export interface TMDBBrowseListItem {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  genre_ids?: number[];
}

export interface TMDBBrowseListResponse {
  results?: TMDBBrowseListItem[];
  total_pages?: number;
  total_results?: number;
}

export async function fetchTmdbList(
  path: string,
  apiKey: string,
  signal: AbortSignal,
  params?: Record<string, string | number | undefined>
): Promise<TMDBBrowseListResponse> {
  const res = await fetch(buildTmdbUrl(path, apiKey, params), { signal });
  if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
  return (await res.json()) as TMDBBrowseListResponse;
}

export async function fetchTmdbListOrEmpty(
  path: string,
  apiKey: string,
  signal: AbortSignal,
  params?: Record<string, string | number | undefined>
): Promise<TMDBBrowseListResponse> {
  try {
    return await fetchTmdbList(path, apiKey, signal, params);
  } catch {
    return { results: [] };
  }
}

// ─── Client-side ─────────────────────────────────────────

export interface TMDBContentCard {
  tmdbId: string;
  title: string;
  type: "movie" | "tv";
  year: number;
  posterUrl: string;
  voteAverage?: number;
  genre: string[];
  isNew: boolean;
}

export function toTMDBContentCard(
  item: TMDBBrowseListItem,
  typeHint?: "movie" | "tv"
): TMDBContentCard | null {
  const type =
    typeHint ?? (item.media_type === "movie" || item.media_type === "tv" ? item.media_type : null);
  if (!type || item.media_type === "person") return null;
  const title = type === "movie" ? item.title : item.name;
  if (!item.id || !title || !item.poster_path) return null;

  const dateStr = type === "movie" ? item.release_date : item.first_air_date;
  const year = dateStr ? getYear(dateStr) : new Date().getFullYear();

  return {
    tmdbId: String(item.id),
    title,
    type,
    year,
    posterUrl: getPosterUrl(item.poster_path),
    voteAverage: item.vote_average,
    genre: (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean) as string[],
    isNew: false
  };
}
