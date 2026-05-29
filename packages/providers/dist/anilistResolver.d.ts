export interface AniListEpisodeAddress {
    anilistId: string;
    episode: number;
}
export declare function resolveAniListId(args: {
    title?: string;
    season: number;
    seasonTitle?: string;
    year?: number;
}): Promise<string | null>;
export declare function resolveAniListEpisodeAddress(args: {
    anilistId?: string | null;
    title?: string;
    season: number;
    seasonTitle?: string;
    year?: number;
    episode: number;
}): Promise<AniListEpisodeAddress | null>;
