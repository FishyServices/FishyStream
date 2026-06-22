export type ContentType = "movie" | "tv";
export type ContentId = `tmdb:${ContentType}:${string}`;
type ContentTypeWire = 0 | 1;

export interface ContentCard {
  _id: ContentId;
  title: string;
  type: ContentType;
  genre: string[];
  year: number;
  voteAverage?: number;
  posterUrl: string;
  tmdbId?: string;
  new: boolean;
}

export interface ContentFeatured extends ContentCard {
  description: string;
  backdropUrl: string;
  rating: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  trending: boolean;
  tagline?: string;
  originalLanguage?: string;
}

export interface ContentDetail extends ContentFeatured {
  imdbId?: string;
  anilistId?: string;
  totalEpisodes?: number;
  status?: string;
}

export interface ContentPlayback {
  _id: ContentId;
  title: string;
  type: ContentType;
  genre: string[];
  year: number;
  posterUrl?: string;
  voteAverage?: number;
  tmdbId?: string;
  imdbId?: string;
  anilistId?: string;
  originalLanguage?: string;
  seasons?: number;
}

export interface WatchlistGridItem {
  _id: ContentId;
  title: string;
  type: ContentType;
  posterUrl: string;
  tmdbId?: string;
  watchlistFolder?: string;
  genre?: string[];
}

export interface WatchHistoryItemMeta extends ContentCard {
  progress: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
}

export interface WatchProgressEntryMeta {
  contentId: ContentId;
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  watchedAt: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  progressId?: string;
}

export interface SeasonMetaSummary {
  seasonNumber: number;
  episodeCount: number;
  anilistId?: string;
  anilistEpisodeMappingCount?: number;
  storedEpisodeCount: number;
}

export interface AniListEpisodeMapping {
  episodeNumber: number;
  anilistId: string;
  anilistEpisodeNumber: number;
}
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";
const TMDB_IMAGE_WIRE_PREFIX = "~";

function toContentTypeWire(type: ContentType): ContentTypeWire {
  return type === "tv" ? 1 : 0;
}

export function makeContentId(type: ContentType, tmdbId: string | number): ContentId {
  return `tmdb:${type}:${String(tmdbId)}` as ContentId;
}

export function parseContentId(id: string): { type: ContentType; tmdbId: string } | null {
  const [prefix, type, ...rest] = id.split(":");
  const tmdbId = rest.join(":");
  if (prefix !== "tmdb" || (type !== "movie" && type !== "tv") || !tmdbId) return null;
  return { type, tmdbId };
}

export function fromContentTypeWire(type: ContentTypeWire | ContentType): ContentType {
  return type === 1 || type === "tv" ? "tv" : "movie";
}

export function toImageWire(url: string): string {
  return url.startsWith(TMDB_IMAGE_BASE)
    ? `${TMDB_IMAGE_WIRE_PREFIX}${url.slice(TMDB_IMAGE_BASE.length)}`
    : url;
}

export function fromImageWire(url: string): string {
  return url.startsWith(TMDB_IMAGE_WIRE_PREFIX)
    ? `${TMDB_IMAGE_BASE}${url.slice(TMDB_IMAGE_WIRE_PREFIX.length)}`
    : url;
}
