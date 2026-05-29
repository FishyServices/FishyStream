export interface EpisodeAddress {
    season: number;
    episode: number;
}
export interface CanonicalSeasonDefinition {
    seasonNumber: number;
    episodeCount: number;
    sourceSeason: number;
    sourceEpisodeStart: number;
}
export interface TvOrderingOverride {
    tmdbId: string;
    canonicalSeasonCount: number;
    canonicalTotalEpisodes: number;
    episodeGroupId?: string;
    canonicalSeasons: CanonicalSeasonDefinition[];
    providerFormats: Partial<Record<string, "canonical" | "tmdb">>;
}
export declare function getTvOrderingOverride(tmdbId?: string | number | null): TvOrderingOverride | null;
export declare function getCanonicalSeasonCount(tmdbId?: string | number | null, fallbackSeasonCount?: number | null): number;
export declare function getCanonicalTotalEpisodes(tmdbId?: string | number | null, fallbackTotalEpisodes?: number | null): number | undefined;
export declare function getCanonicalSeasonEpisodeCount(tmdbId?: string | number | null, seasonNumber?: number | null): number | undefined;
export declare function mapCanonicalToProviderOrder(tmdbId: string | number | null | undefined, providerName: string, address: EpisodeAddress): EpisodeAddress;
export declare function mapProviderToCanonicalOrder(tmdbId: string | number | null | undefined, providerName: string, address: EpisodeAddress): EpisodeAddress;
