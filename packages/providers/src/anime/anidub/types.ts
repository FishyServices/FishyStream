export type AniDubStatus = "dubbed" | "in_production" | "announced" | "none" | "unknown";
export type AniDubFormat = "TV" | "TV_SHORT" | "MOVIE" | "OVA" | "ONA" | "SPECIAL";
export type AniDubSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";
export type AniDubMediaStatus =
  "RELEASING" | "FINISHED" | "NOT_YET_RELEASED" | "HIATUS" | "CANCELLED";
export type AniDubAdultFilter = "show" | "hide" | "only";
export type AniDubDubbedFilter = "any" | "full" | "partial";
export type AniDubListFilter =
  "on" | "off" | "watching" | "planning" | "completed" | "paused" | "dropped";
export type AniDubSort = "relevance" | "popularity" | "score" | "newest" | "recent_dub" | "title";

export interface AniDubInfo {
  language: string;
  status: AniDubStatus;
  confidence: number;
  dubbedEpisodes: number | null;
  sources: string[];
  reason: string | null;
  lastVerifiedAt: string | null;
}

export interface AniDubAnime {
  animeId: string;
  anilistId: number;
  anidubId: number | null;
  malId: number | null;
  kitsuId: number | null;
  titleEnglish: string | null;
  titleRomaji: string | null;
  coverImage: string | null;
  episodes: number | null;
  dub: AniDubInfo | null;
  dubs: AniDubInfo[];
}

export interface AniDubLookupResult {
  results: AniDubAnime[];
  notFound: number[];
}

export interface AniDubSearchItem {
  anilistId: number;
  anidubId?: number | null;
  malId?: number | null;
  titleEnglish: string | null;
  titleRomaji: string | null;
  titleNative?: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  seasonYear: number | null;
  season?: AniDubSeason | null;
  genres?: string[];
  studio?: string | null;
  isAdult?: boolean;
  dubStatus: AniDubStatus;
  dubConfidence: number;
  dubbedEpisodes: number | null;
  dubLastVerifiedAt: string | null;
}

export interface AniDubSearchResult {
  query: string;
  results: AniDubSearchItem[];
}

export interface AniDubBrowseResult {
  results: AniDubSearchItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export interface AniDubTrendingItem extends AniDubSearchItem {
  searchCount?: number;
}

export interface AniDubTrendingResult {
  period: string;
  results: AniDubTrendingItem[];
}

export interface AniDubHealth {
  status: string;
  version?: string;
  timestamp?: string;
}

export interface AniDubBrowseOptions {
  genre?: readonly string[];
  format?: readonly AniDubFormat[];
  yearFrom?: number;
  yearTo?: number;
  year?: number;
  season?: AniDubSeason;
  dubStatus?: readonly AniDubStatus[];
  dubbed?: AniDubDubbedFilter;
  status?: readonly AniDubMediaStatus[];
  adult?: AniDubAdultFilter;
  list?: AniDubListFilter;
  sort?: AniDubSort;
  language?: string;
  limit?: number;
}

export interface AniDubSearchOptions extends AniDubBrowseOptions {
  limit?: number;
}

export interface AniDubPagedBrowseOptions extends AniDubBrowseOptions {
  page?: number;
}

export type AniDubParams = Record<string, string | number | readonly string[] | undefined>;
export type AniDubRequest = (
  path: string,
  params?: AniDubParams,
  options?: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal }
) => Promise<unknown>;
