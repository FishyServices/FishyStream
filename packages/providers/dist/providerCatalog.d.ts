import type { AniListEpisodeMapping } from "./types";
export type ProviderKey = "vidking" | "vidfast" | "videasy" | "vidnest" | "vidrock" | "vidplus (ads)" | "filmu" | "vidzen" | "vixsrc" | "vidsrcpro" | "cinezo" | "mafiaembed" | "superembed" | "autoembed" | "vidsrc" | "2embed" | "vidzee" | "111movies" | "vidplays" | "tryembed" | "vidcore" | "megaplay" | "peachify" | "cinesrc";
export type ProviderCategory = "primary" | "primary_anime" | "other";
export type ProviderIdType = "tmdb" | "imdb" | "both";
export type AnimeIdType = "same" | "anilist";
export interface ProviderProgressConfig {
    origins: string[];
    controlApi?: boolean;
    statusRequest?: boolean;
    resumeParam?: "progress" | "startAt";
    referrerPolicy?: "no-referrer" | "unsafe-url" | "origin" | "origin-when-cross-origin" | "strict-origin" | "strict-origin-when-cross-origin";
}
export interface ProviderCatalogEntry {
    key: ProviderKey;
    name: string;
    category: ProviderCategory;
    idType: ProviderIdType;
    quality: string;
    website?: string;
    animeOnly?: boolean;
    animeIdType?: AnimeIdType;
    dubSupport?: boolean;
    progress?: ProviderProgressConfig;
    getMovieUrl: (id: string) => string;
    getTVUrl: (id: string, season: number, episode: number) => string;
    getAnimeTVUrl?: (id: string, season: number, episode: number, dub?: boolean) => string;
}
export interface StreamSource {
    key: string;
    name: string;
    url: string;
    quality: string;
}
export declare const STREAM_PROVIDERS: ProviderCatalogEntry[];
export declare function getProviderByKey(key: string): ProviderCatalogEntry | undefined;
export declare function getProviderCapabilities(provider: ProviderCatalogEntry): string[];
export declare function getGroupedProviders(providers?: ProviderCatalogEntry[]): ({
    key: "primary";
    label: string;
    providers: ProviderCatalogEntry[];
} | {
    key: "primary_anime";
    label: string;
    providers: ProviderCatalogEntry[];
} | {
    key: "other";
    label: string;
    providers: ProviderCatalogEntry[];
})[];
export declare function getProviderByOrigin(origin: string): ProviderCatalogEntry | undefined;
export declare function getProviderId(provider: ProviderCatalogEntry, imdbId?: string, tmdbId?: string): string | null;
export declare function buildMovieSources(args: {
    imdbId?: string;
    tmdbId?: string;
}): StreamSource[];
export declare function buildTvSources(args: {
    imdbId?: string;
    isAnime?: boolean;
    season: number;
    episode: number;
    title?: string;
    seasonTitle?: string;
    year?: number;
    tmdbId?: string;
    anilistId?: string;
    anilistEpisodeMappings?: AniListEpisodeMapping[];
    dub?: boolean;
}): Promise<StreamSource[]>;
