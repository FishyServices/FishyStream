export type MediaType = "movie" | "tv";

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
export interface Episode {
  id: string;
  type?: MediaType;
  title: string;
  rating?: Rating;
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

export type TMDBMediaType = MediaType;
export type TMDBItem = {
  tmdbId: number;
  title: string;
  posterUrl: string;
  year: number;
  genre: string[];
  rating: string;
  voteAverage?: number;
  type: MediaType;
};
export type TMDBContentCard = {
  tmdbId: string;
  title: string;
  type: MediaType;
  year: number;
  posterUrl: string;
  voteAverage?: number;
  genre: string[];
  isNew: boolean;
};
export type TMDBCreditResult = {
  cast: Array<{ id: number; name: string; character: string; profileUrl?: string; order: number }>;
  directors: string[];
};
export type TMDBVideoResult = { key: string; name: string; type: string; official: boolean };
export type TMDBDetailsResult = {
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
};
export type TMDBFullDetail = {
  tmdbId: string;
  type: MediaType;
  title: string;
  description: string;
  year: number;
  rating: string;
  voteAverage?: number;
  posterUrl: string;
  backdropUrl: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  hasSpecials?: boolean;
  totalEpisodes?: number;
  genre: string[];
  imdbId?: string;
  originalLanguage?: string;
  tagline?: string;
  status?: string;
  trending: boolean;
  isNew: boolean;
};
export type TMDBBrowseListItem = {
  id: number;
  media_type?: "movie" | "tv" | "person";
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  genre_ids?: number[];
  overview?: string;
  original_language?: string;
};
export type TMDBBrowseListResponse = {
  results?: TMDBBrowseListItem[];
  total_pages?: number;
  total_results?: number;
};
export type TMDBDiscoverResult = {
  items: TMDBContentCard[];
  totalPages: number;
  totalResults: number;
};
