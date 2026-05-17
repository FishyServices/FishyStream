import type { Id } from "../convex/_generated/dataModel";

export type ContentId = Id<"content">;
export type SeasonId = Id<"seasons">;
export type ContentType = "movie" | "tv";

export interface ContentMeta {
  _id: ContentId;
  title: string;
  type: ContentType;
  genre?: string[];
  year: number;
  rating?: string;
  voteAverage?: number;
  posterUrl: string;
  tmdbId?: string;
  new?: boolean;
}

export interface FeaturedContentMeta extends Omit<ContentMeta, "genre" | "rating" | "new"> {
  genre: string[];
  rating: string;
  new: boolean;
  description: string;
  backdropUrl: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  trending: boolean;
  tagline?: string;
  originalLanguage?: string;
}

export interface ContentDetail extends FeaturedContentMeta {
  imdbId?: string;
  anilistId?: string;
  voteCount?: number;
  popularity?: number;
  totalEpisodes?: number;
  status?: string;
  productionCountries?: string[];
  spokenLanguages?: string[];
  budget?: number;
  revenue?: number;
}

export interface WatchlistItemMeta extends ContentMeta {
  watchlistAddedAt: number;
  watchlistFolder?: string;
  watchlistNewSeasons: number;
  watchlistNewEpisodes: number;
}

export interface WatchlistUpdateMeta {
  contentId: ContentId;
  title: string;
  posterUrl: string;
  tmdbId?: string;
  currentSeasonCount: number;
  currentEpisodeCount: number;
  newSeasons: number;
  newEpisodes: number;
  folder?: string;
}

export interface WatchHistoryItemMeta extends ContentMeta {
  progress: number;
  completed: boolean;
  watchedAt: number;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
}

export interface SeasonMetaSummary {
  _id: SeasonId;
  contentId: ContentId;
  seasonNumber: number;
  name: string;
  airDate?: string;
  episodeCount: number;
  anilistId?: string;
  storedEpisodeCount: number;
}

export interface ContentSummaryRecord {
  _id: ContentId;
  title: string;
  type: ContentType;
  genre: string[];
  year: number;
  rating: string;
  voteAverage?: number;
  posterUrl: string;
  tmdbId?: string;
  new: boolean;
}

interface FeaturedContentRecord extends ContentSummaryRecord {
  description: string;
  backdropUrl: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  trending: boolean;
  tagline?: string;
  originalLanguage?: string;
}

interface ContentDetailRecord extends FeaturedContentRecord {
  imdbId?: string;
  anilistId?: string;
  voteCount?: number;
  popularity?: number;
  totalEpisodes?: number;
  status?: string;
  productionCountries?: string[];
  spokenLanguages?: string[];
  budget?: number;
  revenue?: number;
}

interface WatchHistoryRecord extends ContentSummaryRecord {
  progress: number;
  completed: boolean;
  watchedAt: number;
  positionSeconds?: number;
  durationSeconds?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
}

interface WatchlistItemRecord extends ContentSummaryRecord {
  watchlistAddedAt: number;
  watchlistFolder?: string;
  watchlistNewSeasons: number;
  watchlistNewEpisodes: number;
}

interface WatchlistUpdateRecord {
  contentId: ContentId;
  title: string;
  posterUrl: string;
  tmdbId?: string;
  currentSeasonCount: number;
  currentEpisodeCount: number;
  newSeasons: number;
  newEpisodes: number;
  folder?: string;
}

interface SeasonSummaryRecord {
  _id: SeasonId;
  contentId: ContentId;
  seasonNumber: number;
  name: string;
  airDate?: string;
  episodeCount: number;
  anilistId?: string;
  episodes: { length: number };
}

export function toContentMeta(content: ContentSummaryRecord): ContentMeta {
  return {
    _id: content._id,
    title: content.title,
    type: content.type,
    year: content.year,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId
  };
}

export function toContentMetaSnapshot(
  content: ContentSummaryRecord
): Omit<ContentSummaryRecord, "_id"> {
  return {
    title: content.title,
    type: content.type,
    genre: content.genre.slice(0, 2),
    year: content.year,
    rating: content.rating,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new
  };
}

export function toFeaturedContentMeta(content: FeaturedContentRecord): FeaturedContentMeta {
  return {
    _id: content._id,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    rating: content.rating,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new,
    description: content.description,
    backdropUrl: content.backdropUrl,
    logoUrl: content.logoUrl,
    trailerKey: content.trailerKey,
    duration: content.duration,
    seasons: content.seasons,
    trending: content.trending,
    tagline: content.tagline,
    originalLanguage: content.originalLanguage
  };
}

export function toContentDetail(content: ContentDetailRecord): ContentDetail {
  return {
    ...toFeaturedContentMeta(content),
    imdbId: content.imdbId,
    anilistId: content.anilistId,
    voteCount: content.voteCount,
    popularity: content.popularity,
    totalEpisodes: content.totalEpisodes,
    status: content.status,
    productionCountries: content.productionCountries,
    spokenLanguages: content.spokenLanguages,
    budget: content.budget,
    revenue: content.revenue
  };
}

export function toWatchHistoryItemMeta(content: WatchHistoryRecord): WatchHistoryItemMeta {
  return {
    ...toContentMeta(content),
    progress: content.progress,
    completed: content.completed,
    watchedAt: content.watchedAt,
    positionSeconds: content.positionSeconds,
    durationSeconds: content.durationSeconds,
    seasonNumber: content.seasonNumber,
    episodeNumber: content.episodeNumber,
    source: content.source,
    dub: content.dub
  };
}

export function toWatchlistItemMeta(content: WatchlistItemRecord): WatchlistItemMeta {
  return {
    ...toContentMeta(content),
    watchlistAddedAt: content.watchlistAddedAt,
    watchlistFolder: content.watchlistFolder,
    watchlistNewSeasons: content.watchlistNewSeasons,
    watchlistNewEpisodes: content.watchlistNewEpisodes
  };
}

export function toWatchlistUpdateMeta(content: WatchlistUpdateRecord): WatchlistUpdateMeta {
  return {
    contentId: content.contentId,
    title: content.title,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    currentSeasonCount: content.currentSeasonCount,
    currentEpisodeCount: content.currentEpisodeCount,
    newSeasons: content.newSeasons,
    newEpisodes: content.newEpisodes,
    folder: content.folder
  };
}

export function toSeasonMetaSummary(content: SeasonSummaryRecord): SeasonMetaSummary {
  return {
    _id: content._id,
    contentId: content.contentId,
    seasonNumber: content.seasonNumber,
    name: content.name,
    airDate: content.airDate,
    episodeCount: content.episodeCount,
    anilistId: content.anilistId,
    storedEpisodeCount: content.episodes.length
  };
}
