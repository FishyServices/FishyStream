import type { Id } from "../convex/_generated/dataModel";

export type ContentId = Id<"content">;
export type SeasonId = Id<"seasons">;
export type ContentType = "movie" | "tv";

interface ContentCardRecord {
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

interface ContentCardRowRecord extends Omit<ContentCardRecord, "_id"> {
  contentId: ContentId;
}

interface ContentFeaturedRecord extends ContentCardRecord {
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

interface ContentDetailRecord extends ContentFeaturedRecord {
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

interface ContentPlaybackRecord extends ContentCardRecord {
  imdbId?: string;
  anilistId?: string;
  originalLanguage?: string;
  seasons?: number;
}

interface WatchHistoryRecord extends ContentCardRecord {
  progress: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
}

interface WatchlistItemRecord extends ContentCardRecord {
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

export interface ContentFeatured {
  _id: ContentId;
  title: string;
  type: ContentType;
  genre: string[];
  year: number;
  voteAverage?: number;
  posterUrl: string;
  tmdbId?: string;
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

export type ContentDetail = ContentFeatured;

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

export interface WatchHistoryItemMeta extends ContentCard {
  progress: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
}

export interface SeasonMetaSummary {
  seasonNumber: number;
  episodeCount: number;
  anilistId?: string;
  storedEpisodeCount: number;
}

export function toContentCard(content: ContentCardRecord): ContentCard {
  return {
    _id: content._id,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new
  };
}

export function toContentCardRow(content: ContentCardRowRecord): ContentCard {
  return {
    _id: content.contentId,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new
  };
}

export function toContentFeatured(content: ContentFeaturedRecord): ContentFeatured {
  return {
    _id: content._id,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    description: content.description,
    backdropUrl: content.backdropUrl,
    rating: content.rating,
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
  return toContentFeatured(content);
}

export function toContentPlayback(content: ContentPlaybackRecord): ContentPlayback {
  return {
    _id: content._id,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    tmdbId: content.tmdbId,
    imdbId: content.imdbId,
    anilistId: content.anilistId,
    originalLanguage: content.originalLanguage,
    seasons: content.seasons
  };
}

export function toWatchHistoryItemMeta(content: WatchHistoryRecord): WatchHistoryItemMeta {
  return {
    ...toContentCard(content),
    progress: content.progress,
    completed: content.completed,
    seasonNumber: content.seasonNumber,
    episodeNumber: content.episodeNumber,
    source: content.source,
    dub: content.dub
  };
}

export function toWatchlistGridItem(
  content: Pick<
    WatchlistItemRecord,
    | "_id"
    | "title"
    | "type"
    | "posterUrl"
    | "tmdbId"
    | "watchlistFolder"
    | "watchlistNewSeasons"
    | "watchlistNewEpisodes"
  >
): WatchlistGridItem {
  return {
    _id: content._id,
    title: content.title,
    type: content.type,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
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
    seasonNumber: content.seasonNumber,
    episodeCount: content.episodeCount,
    anilistId: content.anilistId,
    storedEpisodeCount: content.episodes.length
  };
}
