export declare const TMDB_API_KEY = "84259f99204eeb7d45c7e3d8e36c6123";
export declare const TMDB_BASE_URL = "https://api.themoviedb.org/3";
export declare const TMDB_BASE_URL_2 = "https://api.tmdb.org/3";
export declare const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";
export declare const GENRE_MAP: Record<number, string>;
export declare const TMDB_DISCOVER_GENRES: Record<string, number>;
export declare function getPosterUrl(path: string | null, size?: string): string;
export declare function getBackdropUrl(path: string | null): string;
export declare function getStillUrl(path: string | null): string;
export declare function getGenres(item: {
    genres?: Array<{
        id: number;
        name: string;
    }>;
    genre_ids?: number[];
}): string[];
export declare function getYear(date?: string): number;
export declare function getRating(voteAverage: number, certificationOrRating?: string | null): string;
