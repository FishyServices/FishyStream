import type { Id } from "../convex/_generated/dataModel";

export type ContentId = Id<"content">;
export type SeasonId = Id<"seasons">;
export type ContentType = "movie" | "tv";

export interface ContentMeta {
  _id: ContentId;
  _creationTime: number;
  title: string;
  type: ContentType;
  genre: string[];
  year: number;
  rating: string;
  voteAverage?: number;
  popular: boolean;
  posterUrl: string;
  tmdbId?: string;
  new: boolean;
}

export interface FeaturedContentMeta extends ContentMeta {
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

export interface ContentCategoryMeta {
  id: string;
  title: string;
  content: ContentMeta[];
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

type ContentMetaSource = {
  _id: ContentId;
  _creationTime: number;
  title: string;
  type: ContentType;
  genre: string[];
  year: number;
  rating: string;
  voteAverage?: number;
  popular: boolean;
  posterUrl: string;
  tmdbId?: string;
  new: boolean;
};

type FeaturedContentMetaSource = ContentMetaSource & {
  description: string;
  backdropUrl: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  trending: boolean;
  tagline?: string;
  originalLanguage?: string;
};

export function toContentMeta(content: ContentMetaSource): ContentMeta {
  return {
    _id: content._id,
    _creationTime: content._creationTime,
    title: content.title,
    type: content.type,
    genre: content.genre,
    year: content.year,
    rating: content.rating,
    voteAverage: content.voteAverage,
    popular: content.popular,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new
  };
}

export function toFeaturedContentMeta(content: FeaturedContentMetaSource): FeaturedContentMeta {
  return {
    ...toContentMeta(content),
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
