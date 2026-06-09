export declare const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
export declare const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export declare const TMDB_BASE_URL_2 = "https://api.tmdb.org/3";
export declare const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
export declare const GENRE_MAP: Record<number, string>;
export declare const TMDB_DISCOVER_GENRES: Record<string, number>;
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
    videos?: {
        results: TMDBVideo[];
    };
    images?: {
        logos?: TMDBLogo[];
    };
    external_ids?: {
        imdb_id?: string;
    };
}
export interface TMDBTVDetails extends TMDBTVListItem {
    genres?: TMDBGenre[];
    number_of_seasons?: number;
    number_of_episodes?: number;
    episode_run_time?: number[];
    status?: string;
    tagline?: string;
    videos?: {
        results: TMDBVideo[];
    };
    images?: {
        logos?: TMDBLogo[];
    };
    external_ids?: {
        imdb_id?: string;
    };
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
export declare function getPosterUrl(path: string | null, size?: string): string;
export declare function getBackdropUrl(path: string | null): string;
export declare function getStillUrl(path: string | null): string;
export declare function getProfileUrl(path: string | null): string;
export declare function getGenres(item: {
    genres?: Array<{
        id: number;
        name: string;
    }>;
    genre_ids?: number[];
}): string[];
export declare function getYear(date?: string): number;
export declare function getRating(voteAverage: number, certificationOrRating?: string | null): string;
export declare function getLogoUrl(logos: TMDBLogo[] | undefined): string | undefined;
export declare function getTrailerKey(videos: TMDBVideo[] | undefined): string | undefined;
export declare function isAnimeLikeContent(args: {
    type: "movie" | "tv";
    genres: string[];
    originalLanguage?: string;
}): boolean;
export declare function formatRuntime(minutes?: number): string | undefined;
export declare function shuffleWithSeed<T>(items: T[], seed: number): T[];
export declare function mapInBatches<T, R>(items: T[], batchSize: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
export declare function mapTmdbSeasonToCanonicalPayload(data: TMDBSeasonDetails, seasonNumber: number): CanonicalSeasonPayload;
export declare function compactSeasonEpisodesForDb(episodes: CanonicalSeasonPayload["episodes"]): CompactEpisode[];
export declare function hasEpisodes(data: TMDBSeasonDetails | null): data is TMDBSeasonDetails;
export declare function tmdbGet<T>(endpoint: string, params?: Record<string, string>, proxyUrls?: string[]): Promise<T | null>;
export declare function buildTmdbUrl(path: string, apiKey: string, params?: Record<string, string | number | undefined>): string;
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
export declare function fetchTmdbList(path: string, apiKey: string, signal: AbortSignal, params?: Record<string, string | number | undefined>): Promise<TMDBBrowseListResponse>;
export declare function fetchTmdbListOrEmpty(path: string, apiKey: string, signal: AbortSignal, params?: Record<string, string | number | undefined>): Promise<TMDBBrowseListResponse>;
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
export declare function fetchTmdbCredits(tmdbId: number, type: "movie" | "tv", apiKey: string, signal?: AbortSignal): Promise<TMDBCreditResult | null>;
export interface TMDBVideoResult {
    key: string;
    name: string;
    type: string;
    official: boolean;
}
export declare function fetchTmdbVideos(tmdbId: number, type: "movie" | "tv", apiKey: string, signal?: AbortSignal): Promise<TMDBVideoResult[]>;
export declare function fetchTmdbRelated(tmdbId: number, type: "movie" | "tv", apiKey: string, limit?: number, signal?: AbortSignal): Promise<TMDBItem[]>;
export type TMDBMediaType = "movie" | "tv";
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
export declare function toTMDBContentCard(item: TMDBBrowseListItem, typeHint?: TMDBMediaType): TMDBContentCard | null;
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
export declare function toTMDBItem(item: TMDBBrowseListItem, type: TMDBMediaType): TMDBItem;
export declare function tmdbSortParam(sortBy: string, type: TMDBMediaType): string;
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
export declare function fetchTmdbDetails(tmdbId: string, type: TMDBMediaType, apiKey: string, signal?: AbortSignal): Promise<TMDBDetailsResult | null>;
export interface TMDBSearchResult {
    movies: TMDBItem[];
    shows: TMDBItem[];
}
export declare function fetchTmdbSearch(query: string, apiKey: string, signal?: AbortSignal): Promise<TMDBSearchResult>;
export interface TMDBDiscoverResult {
    items: TMDBContentCard[];
    totalPages: number;
    totalResults: number;
}
export declare function fetchTmdbDiscover(type: TMDBMediaType, apiKey: string, signal: AbortSignal, opts?: {
    page?: number;
    sortBy?: string;
    genreId?: number;
    minVoteCount?: number;
}): Promise<TMDBDiscoverResult>;
export declare function collectTmdbCards(responses: Array<{
    data: TMDBBrowseListResponse;
    type?: TMDBMediaType;
}>, opts?: {
    excludedIds?: Set<string>;
    typeFilter?: "all" | TMDBMediaType;
}): TMDBContentCard[];
