import type { MediaType } from "../shared/media.js";

export type { MediaType };

export type DiscoverSort = "popularity" | "rating" | "trending";

export interface TitleReference {
  id: string;
  type?: MediaType;
  seasonNumber?: number;
  cursor?: string;
}

export interface Rating {
  value: number;
  voteCount?: number;
}

export interface Title {
  id: string;
  type?: MediaType;
  title: string;
  rating?: Rating;
}

export interface Episode extends Title {
  seasonNumber?: number;
  episodeNumber?: number;
}

export interface EpisodePage {
  episodes: Episode[];
  nextCursor?: string;
}

export interface MetadataClient {
  getTitle(reference: TitleReference, signal?: AbortSignal): Promise<Title | null>;
  getTitleRating(reference: TitleReference, signal?: AbortSignal): Promise<Rating | null>;
  getEpisodePage(reference: TitleReference, signal?: AbortSignal): Promise<EpisodePage>;
}

export interface CardBase {
  type: MediaType;
  title: string;
  year: number;
  posterUrl: string;
  voteAverage?: number;
  genre: string[];
  isNew: boolean;
}

export interface ItemBase {
  type: MediaType;
  title: string;
  year: number;
  posterUrl: string;
  rating: string;
  voteAverage?: number;
  genre: string[];
}

export interface CastMember<Id extends string | number> {
  id: Id;
  name: string;
  character: string;
  profileUrl?: string;
  order: number;
}

export interface CreditResult<Id extends string | number> {
  cast: CastMember<Id>[];
  directors: string[];
}

export interface VideoResult {
  key: string;
  name: string;
  type: string;
  official: boolean;
}

export interface TitleDetails {
  description: string;
  backdropUrl: string;
  rating: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  hasSpecials?: boolean;
  tagline?: string;
  originalLanguage?: string;
}

export interface FullDetailBase extends TitleDetails {
  type: MediaType;
  title: string;
  year: number;
  voteAverage?: number;
  posterUrl: string;
  totalEpisodes?: number;
  genre: string[];
  status?: string;
  trending: boolean;
  isNew: boolean;
}

export interface DiscoverResult<Card> {
  items: Card[];
  totalPages: number;
  totalResults: number;
}

export interface SeasonEpisode {
  episodeNumber: number;
  name: string;
  overview?: string;
  stillUrl?: string;
  runtime?: number;
  voteAverage: number;
}

export interface SeasonDetail {
  overview?: string;
  airDate?: string;
  episodes: SeasonEpisode[];
}
