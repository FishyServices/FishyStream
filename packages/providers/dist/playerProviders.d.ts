import type { ProviderCatalogEntry, ProviderKey } from "./providerCatalog";
export interface PlayerEventData {
    event: "timeupdate" | "play" | "pause" | "ended" | "seeked" | "playerstatus";
    currentTime: number;
    duration: number;
    progress?: number;
    id?: string;
    tmdbId?: number;
    mediaType: "movie" | "tv";
    season?: number;
    episode?: number;
    timestamp?: number;
    playing?: boolean;
    muted?: boolean;
    volume?: number;
}
export interface PlayerEventPayload {
    type: "PLAYER_EVENT";
    data: PlayerEventData;
}
export declare function isKnownPlayerOrigin(origin: string): boolean;
export declare function parsePlayerMessage(raw: unknown, origin?: string): PlayerEventPayload | null;
export declare function calculateProgress(currentTime: number, duration: number): number;
export interface PlayerControls {
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    setVolume: (level: number) => void;
    mute: (muted: boolean) => void;
    getStatus: () => void;
}
export type ProviderContentType = "movie" | "tv";
export interface ProviderEmbedUrlOptions {
    sourceUrl: string;
    provider?: Pick<ProviderCatalogEntry, "key" | "progress">;
    contentType: ProviderContentType;
    resumePositionSeconds?: number;
    watchCompleted?: boolean;
    baseUrl?: string;
}
export declare function shouldApplyProviderResume(providerKey: ProviderKey | string | undefined, contentType: ProviderContentType): boolean;
export declare function shouldForceProviderStartPosition(providerKey: ProviderKey | string | undefined): providerKey is "vidfast";
export declare function applyProviderEmbedParams(url: URL, providerKey: ProviderKey | string | undefined, contentType: ProviderContentType): void;
export declare function createProviderEmbedUrl({ sourceUrl, provider, contentType, resumePositionSeconds, watchCompleted, baseUrl }: ProviderEmbedUrlOptions): string;
export declare function shouldDisableProviderSubtitles(providerKey: ProviderKey | string | undefined): providerKey is "vidplays";
export declare function postMessageToPlayer(iframe: HTMLIFrameElement | null, command: string, params?: Record<string, unknown>): void;
export declare function createPlayerControls(iframeRef: {
    current: HTMLIFrameElement | null;
}): PlayerControls;
