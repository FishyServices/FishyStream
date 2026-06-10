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

export type TMDBMediaType = "movie" | "tv";

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

export interface TMDBContentCard {
  tmdbId: string;
  title: string;
  type: TMDBMediaType;
  year: number;
  posterUrl: string;
  voteAverage?: number;
  genre: string[];
  isNew: boolean;
}

export interface TMDBItem {
  tmdbId: number;
  title: string;
  posterUrl: string;
  year: number;
  genre: string[];
  rating: string;
  voteAverage?: number;
  type: TMDBMediaType;
}

export interface TMDBCreditResult {
  cast: Array<{
    id: number;
    name: string;
    character: string;
    profileUrl?: string;
    order: number;
  }>;
  directors: string[];
}

export interface TMDBVideoResult {
  key: string;
  name: string;
  type: string;
  official: boolean;
}

export interface TMDBDetailsResult {
  description: string;
  backdropUrl: string;
  rating: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  tagline?: string;
  originalLanguage?: string;
}

export interface TMDBSearchResult {
  movies: TMDBItem[];
  shows: TMDBItem[];
}

export interface TMDBDiscoverResult {
  items: TMDBContentCard[];
  totalPages: number;
  totalResults: number;
}

export interface TMDBFullDetail {
  tmdbId: string;
  type: TMDBMediaType;
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
  totalEpisodes?: number;
  genre: string[];
  imdbId?: string;
  originalLanguage?: string;
  tagline?: string;
  status?: string;
  trending: boolean;
  isNew: boolean;
}
