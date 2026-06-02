import type { Id } from "../convex/_generated/dataModel";

export type ContentId = Id<"content">;
export type ContentType = "movie" | "tv";
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

export type ContentCardWire = [
  contentId: ContentId,
  title: string,
  type: ContentTypeWire,
  posterUrl: string,
  year: number,
  voteAverage: number | null,
  tmdbId: string | null,
  isNew: boolean,
  genre?: string[]
];

export type ContentFeaturedWire = [
  contentId: ContentId,
  title: string,
  type: ContentTypeWire,
  posterUrl: string,
  year: number,
  voteAverage: number | null,
  tmdbId: string | null,
  isNew: boolean,
  description: string,
  backdropUrl: string,
  rating: string,
  trending: boolean,
  genre?: string[] | null,
  logoUrl?: string | null,
  trailerKey?: string | null,
  duration?: string | null,
  seasons?: number | null,
  tagline?: string | null,
  originalLanguage?: string | null,
  imdbId?: string | null,
  anilistId?: string | null,
  totalEpisodes?: number | null,
  status?: string | null
];

export type ContentDetailWire = ContentFeaturedWire;

export type ContentPlaybackWire = [
  contentId: ContentId,
  title: string,
  type: ContentTypeWire,
  year: number,
  tmdbId: string | null,
  imdbId: string | null,
  anilistId: string | null,
  originalLanguage: string | null,
  seasons: number | null,
  genre?: string[]
];

export type HomeViewWire = {
  featured: ContentFeaturedWire[];
  categories: Array<{ id: string; title: string; content: ContentCardWire[] }>;
};

export type WatchlistGridWire = [
  contentId: ContentId,
  title: string,
  type: ContentTypeWire,
  posterUrl: string,
  tmdbId?: string | null,
  watchlistFolder?: string | null,
  genre?: string[] | null
];

export type WatchHistoryItemWire = [
  contentId: ContentId,
  title: string,
  type: ContentTypeWire,
  posterUrl: string,
  progress: number,
  completed: boolean,
  tmdbId?: string | null,
  seasonNumber?: number | null,
  episodeNumber?: number | null,
  source?: string | null,
  dub?: boolean | null
];

export type WatchProgressEntryMeta = [
  contentId: ContentId,
  progress: number,
  positionSeconds: number,
  durationSeconds: number,
  completed: boolean,
  watchedAt: number,
  seasonNumber?: number | null,
  episodeNumber?: number | null,
  source?: string | null,
  dub?: boolean | null,
  progressId?: Id<"watchProgress"> | null
];

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

type CardRecord = {
  _id?: unknown;
  contentId?: ContentId;
  title: string;
  type: ContentType;
  genre: string[];
  year: number;
  voteAverage?: number;
  posterUrl: string;
  tmdbId?: string;
  new: boolean;
};

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/";
const TMDB_IMAGE_WIRE_PREFIX = "~";

function toContentTypeWire(type: ContentType): ContentTypeWire {
  return type === "tv" ? 1 : 0;
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

type DetailRecord = CardRecord & {
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
  imdbId?: string;
  anilistId?: string;
  totalEpisodes?: number;
  status?: string;
};

function contentIdOf(record: CardRecord): ContentId {
  return (record.contentId ?? record._id) as ContentId;
}

function compactDescription(value: string) {
  return value.length > 200 ? `${value.slice(0, 200).trimEnd()}...` : value;
}

export function toContentCardWire(content: CardRecord): ContentCardWire {
  return [
    contentIdOf(content),
    content.title,
    toContentTypeWire(content.type),
    toImageWire(content.posterUrl),
    content.year,
    content.voteAverage ?? null,
    content.tmdbId ?? null,
    content.new
  ];
}

export function compactContentCardWire(item: ContentCardWire): ContentCardWire {
  return [
    item[0],
    item[1],
    toContentTypeWire(fromContentTypeWire(item[2])),
    toImageWire(item[3]),
    item[4],
    item[5] ?? null,
    item[6] ?? null,
    item[7]
  ];
}

export function fromContentCardWire(item: ContentCardWire): ContentCard {
  return {
    _id: item[0],
    title: item[1],
    type: fromContentTypeWire(item[2]),
    posterUrl: fromImageWire(item[3]),
    year: item[4],
    voteAverage: item[5] ?? undefined,
    tmdbId: item[6] ?? undefined,
    new: item[7],
    genre: item[8] ?? []
  };
}

export function toContentFeaturedWire(content: DetailRecord): ContentFeaturedWire {
  return [
    contentIdOf(content),
    content.title,
    toContentTypeWire(content.type),
    toImageWire(content.posterUrl),
    content.year,
    content.voteAverage ?? null,
    content.tmdbId ?? null,
    content.new,
    compactDescription(content.description),
    toImageWire(content.backdropUrl),
    content.rating,
    content.trending,
    content.genre.slice(0, 3),
    content.logoUrl ? toImageWire(content.logoUrl) : null,
    content.trailerKey ?? null,
    content.duration ?? null,
    content.seasons ?? null,
    content.tagline ?? null,
    content.originalLanguage ?? null,
    content.imdbId ?? null,
    content.anilistId ?? null,
    content.totalEpisodes ?? null,
    content.status ?? null
  ];
}

export function compactContentFeaturedWire(item: ContentFeaturedWire): ContentFeaturedWire {
  return [
    item[0],
    item[1],
    toContentTypeWire(fromContentTypeWire(item[2])),
    toImageWire(item[3]),
    item[4],
    item[5] ?? null,
    item[6] ?? null,
    item[7],
    item[8],
    toImageWire(item[9]),
    item[10],
    item[11],
    item[12] ?? null,
    item[13] ? toImageWire(item[13]) : null,
    item[14] ?? null,
    item[15] ?? null,
    item[16] ?? null,
    item[17] ?? null,
    item[18] ?? null,
    item[19] ?? null,
    item[20] ?? null,
    item[21] ?? null,
    item[22] ?? null
  ];
}

export function fromContentFeaturedWire(item: ContentFeaturedWire): ContentDetail {
  return {
    _id: item[0],
    title: item[1],
    type: fromContentTypeWire(item[2]),
    posterUrl: fromImageWire(item[3]),
    year: item[4],
    voteAverage: item[5] ?? undefined,
    tmdbId: item[6] ?? undefined,
    new: item[7],
    description: item[8],
    backdropUrl: fromImageWire(item[9]),
    rating: item[10],
    trending: item[11],
    genre: item[12] ?? [],
    logoUrl: item[13] ? fromImageWire(item[13]) : undefined,
    trailerKey: item[14] ?? undefined,
    duration: item[15] ?? undefined,
    seasons: item[16] ?? undefined,
    tagline: item[17] ?? undefined,
    originalLanguage: item[18] ?? undefined,
    imdbId: item[19] ?? undefined,
    anilistId: item[20] ?? undefined,
    totalEpisodes: item[21] ?? undefined,
    status: item[22] ?? undefined
  };
}

export const fromContentDetailWire = fromContentFeaturedWire;
export const toContentDetailWire = toContentFeaturedWire;

export function toContentPlaybackWire(content: DetailRecord): ContentPlaybackWire {
  return [
    contentIdOf(content),
    content.title,
    toContentTypeWire(content.type),
    content.year,
    content.tmdbId ?? null,
    content.imdbId ?? null,
    content.anilistId ?? null,
    content.originalLanguage ?? null,
    content.seasons ?? null,
    content.genre
  ];
}

export function fromContentPlaybackWire(item: ContentPlaybackWire): ContentPlayback {
  return {
    _id: item[0],
    title: item[1],
    type: fromContentTypeWire(item[2]),
    year: item[3],
    tmdbId: item[4] ?? undefined,
    imdbId: item[5] ?? undefined,
    anilistId: item[6] ?? undefined,
    originalLanguage: item[7] ?? undefined,
    seasons: item[8] ?? undefined,
    genre: item[9] ?? []
  };
}

export function toWatchHistoryItemWire(item: WatchHistoryItemMeta): WatchHistoryItemWire {
  const entry: WatchHistoryItemWire = [
    item._id,
    item.title,
    toContentTypeWire(item.type),
    toImageWire(item.posterUrl),
    item.progress,
    item.completed
  ];

  if (
    item.tmdbId !== undefined ||
    item.seasonNumber !== undefined ||
    item.episodeNumber !== undefined ||
    item.source !== undefined ||
    item.dub !== undefined
  ) {
    entry[6] = item.tmdbId ?? null;
    entry[7] = item.seasonNumber ?? null;
    entry[8] = item.episodeNumber ?? null;
    entry[9] = item.source ?? null;
    entry[10] = item.dub ?? null;
  }

  return entry;
}

export function fromWatchHistoryItemWire(item: WatchHistoryItemWire): WatchHistoryItemMeta {
  return {
    _id: item[0],
    title: item[1],
    type: fromContentTypeWire(item[2]),
    posterUrl: fromImageWire(item[3]),
    progress: item[4],
    completed: item[5],
    tmdbId: item[6] ?? undefined,
    seasonNumber: item[7] ?? undefined,
    episodeNumber: item[8] ?? undefined,
    source: item[9] ?? undefined,
    dub: item[10] ?? undefined,
    year: 0,
    voteAverage: undefined,
    new: false,
    genre: []
  };
}

export function toWatchProgressEntryMeta(row: {
  _id?: Id<"watchProgress">;
  contentId: ContentId;
  progress: number;
  positionSeconds?: number;
  durationSeconds?: number;
  completed: boolean;
  watchedAt: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
}): WatchProgressEntryMeta {
  const entry: WatchProgressEntryMeta = [
    row.contentId,
    row.progress,
    row.positionSeconds ?? 0,
    row.durationSeconds ?? 0,
    row.completed,
    row.watchedAt
  ];

  if (
    row.seasonNumber !== undefined ||
    row.episodeNumber !== undefined ||
    row.source !== undefined ||
    row.dub !== undefined
  ) {
    entry[6] = row.seasonNumber ?? null;
    entry[7] = row.episodeNumber ?? null;
    entry[8] = row.source ?? null;
    entry[9] = row.dub ?? null;
  }
  if (row._id !== undefined) {
    entry[6] = entry[6] ?? null;
    entry[7] = entry[7] ?? null;
    entry[8] = entry[8] ?? null;
    entry[9] = entry[9] ?? null;
    entry[10] = row._id;
  }

  return entry;
}

export function toWatchlistGridWire(item: WatchlistGridItem): WatchlistGridWire {
  const entry: WatchlistGridWire = [
    item._id,
    item.title,
    toContentTypeWire(item.type),
    toImageWire(item.posterUrl)
  ];

  if (item.tmdbId !== undefined || item.watchlistFolder !== undefined || item.genre !== undefined) {
    entry[4] = item.tmdbId ?? null;
    entry[5] = item.watchlistFolder ?? null;
    entry[6] = item.genre ?? null;
  }

  return entry;
}

export function fromWatchlistGridWire(item: WatchlistGridWire): WatchlistGridItem {
  return {
    _id: item[0],
    title: item[1],
    type: fromContentTypeWire(item[2]),
    posterUrl: fromImageWire(item[3]),
    tmdbId: item[4] ?? undefined,
    watchlistFolder: item[5] ?? undefined,
    genre: item[6] ?? undefined
  };
}
