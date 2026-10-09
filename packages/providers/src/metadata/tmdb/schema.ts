export interface TMDBGenre {
  id?: number;
  name?: string;
}

export interface TMDBListItem {
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
  popularity?: number;
  genre_ids?: number[];
  genres?: TMDBGenre[];
  overview?: string;
  original_language?: string;
}

export interface TMDBListResponse {
  results?: TMDBListItem[];
  total_pages?: number;
  total_results?: number;
}

export interface TMDBTitleResponse extends TMDBListItem {
  runtime?: number | null;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: Array<{ season_number: number }>;
  imdb_id?: string | null;
  external_ids?: { imdb_id?: string | null };
  tagline?: string;
  status?: string;
  content_ratings?: { results?: Array<{ iso_3166_1?: string; rating?: string }> };
  release_dates?: {
    results?: Array<{
      iso_3166_1?: string;
      release_dates?: Array<{ certification?: string }>;
    }>;
  };
}

export interface TMDBFindResponse {
  movie_results?: TMDBListItem[];
  tv_results?: TMDBListItem[];
}

export interface TMDBCreditsResponse {
  cast?: Array<{
    id: number;
    name: string;
    character?: string;
    profile_path?: string | null;
    order?: number;
  }>;
  crew?: Array<{ name: string; job: string }>;
}

export interface TMDBVideosResponse {
  results?: Array<{
    key?: string;
    name?: string;
    site?: string;
    type?: string;
    official?: boolean;
  }>;
}

export interface TMDBSeasonResponse {
  overview?: string;
  air_date?: string;
  episodes?: Array<{
    id: number;
    episode_number: number;
    name: string;
    overview?: string;
    still_path?: string | null;
    runtime?: number | null;
    vote_average?: number;
  }>;
}
