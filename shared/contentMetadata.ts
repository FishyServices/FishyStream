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
  rating: string;
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
  watchedAt: number;
  positionSeconds?: number;
  durationSeconds?: number;
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
  rating: string;
  voteAverage?: number;
  posterUrl: string;
  tmdbId?: string;
  new: boolean;
}

export interface ContentFeatured extends Omit<ContentCard, "genre"> {
  genre: string[];
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

export interface ContentDetail extends ContentFeatured {
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

export interface ContentPlayback extends ContentCard {
  imdbId?: string;
  anilistId?: string;
  originalLanguage?: string;
  seasons?: number;
}

export interface WatchlistItemMeta extends ContentCard {
  watchlistAddedAt: number;
  watchlistFolder?: string;
  watchlistNewSeasons: number;
  watchlistNewEpisodes: number;
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

export function toContentCard(content: ContentCardRecord): ContentCard {
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
    rating: content.rating,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new
  };
}

export function toContentCardSnapshot(
  content: ContentCardRecord
): Omit<ContentCardRecord, "_id"> {
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

export function toContentFeatured(content: ContentFeaturedRecord): ContentFeatured {
  return {
    ...toContentCard(content),
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
    ...toContentFeatured(content),
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

export function toContentPlayback(content: ContentPlaybackRecord): ContentPlayback {
  return {
    ...toContentCard(content),
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
    ...toContentCard(content),
    watchlistAddedAt: content.watchlistAddedAt,
    watchlistFolder: content.watchlistFolder,
    watchlistNewSeasons: content.watchlistNewSeasons,
    watchlistNewEpisodes: content.watchlistNewEpisodes
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
