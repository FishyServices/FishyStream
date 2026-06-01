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
    anilistEpisodeMappingCount?: number;
}
export interface NextEpisodeArgs {
    tmdbId?: string | number | null;
    currentSeason: number;
    currentEpisode: number;
    fallbackSeasonCount?: number | null;
    currentSeasonEpisodeCount?: number | null;
}
export interface PlaybackProgressSample {
    event: "timeupdate" | "play" | "pause" | "ended" | "seeked" | "playerstatus";
    currentTime: number;
    duration: number;
    progress: number;
    sampledAt: number;
}
export declare const WATCH_PROGRESS_SYNC_INTERVAL_MS: number;
export declare const WATCH_PROGRESS_STATUS_POLL_MS = 30000;
export declare const WATCH_PROGRESS_MIN_LOCAL_SAMPLE_MS = 15000;
export declare const WATCH_PROGRESS_MIN_POSITION_DELTA_SECONDS = 30;
export declare const WATCH_PROGRESS_MIN_PERCENT_DELTA = 2;
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
export declare function hasAnimeEpisodeMappingMetadata(currentSeasonData: Pick<AnimeSeasonMetadataLike, "episodeCount" | "anilistEpisodeMappings" | "anilistEpisodeMappingCount"> | null | undefined): boolean;
export declare function getSeasonYear(airDate?: string): number | undefined;
export declare function getNextEpisodeAddress({ tmdbId, currentSeason, currentEpisode, fallbackSeasonCount, currentSeasonEpisodeCount }: NextEpisodeArgs): {
    season: number;
    episode: number;
} | null;
export declare function hasNextEpisode(args: NextEpisodeArgs): boolean;
export declare function normalizePlaybackProgressSample(sample: Omit<PlaybackProgressSample, "sampledAt">): PlaybackProgressSample;
export declare function shouldStorePlaybackProgressSample(previous: PlaybackProgressSample | undefined, next: PlaybackProgressSample): boolean;
