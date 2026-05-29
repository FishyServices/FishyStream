import { type StreamSource } from "./providerCatalog";
export interface ProviderGroupedSources {
    key: "primary" | "primary_anime" | "other";
    label: string;
    sources: StreamSource[];
}
export interface AnimeContentLike {
    type: "movie" | "tv";
    genre?: string[];
    originalLanguage?: string;
}
export interface AnimeSeasonMetadataLike {
    seasonNumber: number;
    episodeCount?: number;
    anilistId?: string;
    anilistEpisodeMappings?: Array<{
        episodeNumber: number;
    }>;
}
export interface NextEpisodeArgs {
    tmdbId?: string | number | null;
    currentSeason: number;
    currentEpisode: number;
    fallbackSeasonCount?: number | null;
    currentSeasonEpisodeCount?: number | null;
}
export declare function groupSourcesByProviderCategory(sources: StreamSource[]): ProviderGroupedSources[];
export declare function pickPreferredSource(sources: StreamSource[], options: {
    initialSource?: string;
    defaultProvider?: string;
}): StreamSource | undefined;
export declare function isAnimeProviderContent(content: AnimeContentLike): boolean;
export declare function shouldWaitForAnimeSeasonMetadata(args: {
    contentType: "movie" | "tv";
    isAnime: boolean;
    seasonNumber: number;
    currentSeasonData: Pick<AnimeSeasonMetadataLike, "seasonNumber"> | null | undefined;
}): boolean;
export declare function hasAnimeEpisodeMappingMetadata(currentSeasonData: Pick<AnimeSeasonMetadataLike, "episodeCount" | "anilistEpisodeMappings"> | null | undefined): boolean;
export declare function getSeasonYear(airDate?: string): number | undefined;
export declare function getNextEpisodeAddress({ tmdbId, currentSeason, currentEpisode, fallbackSeasonCount, currentSeasonEpisodeCount }: NextEpisodeArgs): {
    season: number;
    episode: number;
} | null;
export declare function hasNextEpisode(args: NextEpisodeArgs): boolean;
