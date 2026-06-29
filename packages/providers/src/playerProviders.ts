import { getProviderByOrigin } from "./providerCatalog";
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

type RawMediaProgress = {
  watched: number;
  duration: number;
  percentage?: number;
};

type RawMediaData = {
  id: string | number;
  type: "movie" | "tv" | "anime";
  mediaType?: "movie" | "tv" | "anime";
  title?: string;
  progress: RawMediaProgress;
  last_season_watched?: number | string;
  last_episode_watched?: number | string;
};

type RawProgressPayload = {
  id: string | number;
  type: "movie" | "tv" | "anime";
  progress: number;
  timestamp: number;
  duration: number;
  season?: number | string;
  episode?: number | string;
};

type MegaPlayTimePayload = {
  event: "time" | "complete" | "error";
  time?: number | string;
  duration?: number | string;
  percent?: number | string;
};

type MegaPlayWatchingLogPayload = {
  type: "watching-log";
  currentTime?: number | string;
  duration?: number | string;
};

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseMaybeJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isPlayerEventPayload(value: unknown): value is PlayerEventPayload {
  if (!isRecord(value) || value.type !== "PLAYER_EVENT" || !isRecord(value.data)) return false;
  return typeof value.data.event === "string";
}

function isRawMediaData(value: unknown): value is RawMediaData {
  if (!isRecord(value) || !isRecord(value.progress)) return false;
  return (
    value.id !== undefined &&
    (value.type === "movie" || value.type === "tv" || value.type === "anime") &&
    toFiniteNumber(value.progress.watched) !== undefined &&
    toFiniteNumber(value.progress.duration) !== undefined
  );
}

function unwrapMediaData(value: unknown): RawMediaData | null {
  if (isRawMediaData(value)) return value;
  if (!isRecord(value)) return null;
  const firstValue = Object.values(value)[0];
  return isRawMediaData(firstValue) ? firstValue : null;
}

function isRawProgressPayload(value: unknown): value is RawProgressPayload {
  if (!isRecord(value)) return false;
  return (
    value.id !== undefined &&
    (value.type === "movie" || value.type === "tv" || value.type === "anime") &&
    toFiniteNumber(value.progress) !== undefined &&
    toFiniteNumber(value.timestamp) !== undefined &&
    toFiniteNumber(value.duration) !== undefined
  );
}

function isMegaPlayTimePayload(value: unknown): value is MegaPlayTimePayload {
  if (!isRecord(value)) return false;
  return (
    (value.event === "time" || value.event === "complete" || value.event === "error") &&
    (toFiniteNumber(value.time) !== undefined ||
      toFiniteNumber(value.duration) !== undefined ||
      toFiniteNumber(value.percent) !== undefined)
  );
}

function isMegaPlayWatchingLogPayload(value: unknown): value is MegaPlayWatchingLogPayload {
  if (!isRecord(value) || value.type !== "watching-log") return false;
  return (
    toFiniteNumber(value.currentTime) !== undefined || toFiniteNumber(value.duration) !== undefined
  );
}

function normalizeMediaType(value: unknown): "movie" | "tv" {
  return value === "movie" ? "movie" : "tv";
}

function normalizePlayerEventPayload(payload: PlayerEventPayload): PlayerEventPayload {
  return {
    type: "PLAYER_EVENT",
    data: {
      ...payload.data,
      mediaType: normalizeMediaType(payload.data.mediaType),
      season: toFiniteNumber(payload.data.season),
      episode: toFiniteNumber(payload.data.episode)
    }
  };
}

function mediaDataToPlayerEvent(value: RawMediaData): PlayerEventPayload {
  const watched = toFiniteNumber(value.progress.watched) ?? 0;
  const duration = toFiniteNumber(value.progress.duration) ?? 0;
  const explicitProgress = toFiniteNumber(value.progress.percentage);

  return {
    type: "PLAYER_EVENT",
    data: {
      event: "timeupdate",
      currentTime: watched,
      duration,
      progress: explicitProgress ?? calculateProgress(watched, duration),
      id: String(value.id),
      mediaType: normalizeMediaType(value.mediaType ?? value.type),
      timestamp: Date.now()
    }
  };
}

function rawProgressToPlayerEvent(value: RawProgressPayload): PlayerEventPayload {
  const currentTime = toFiniteNumber(value.timestamp) ?? 0;
  const duration = toFiniteNumber(value.duration) ?? 0;

  return {
    type: "PLAYER_EVENT",
    data: {
      event: "timeupdate",
      currentTime,
      duration,
      progress: toFiniteNumber(value.progress) ?? calculateProgress(currentTime, duration),
      id: String(value.id),
      mediaType: normalizeMediaType(value.type),
      season: toFiniteNumber(value.season),
      episode: toFiniteNumber(value.episode),
      timestamp: Date.now()
    }
  };
}

function megaPlayTimeToPlayerEvent(value: MegaPlayTimePayload): PlayerEventPayload {
  const currentTime = Math.max(0, toFiniteNumber(value.time) ?? 0);
  const duration = Math.max(0, toFiniteNumber(value.duration) ?? 0);
  const progress = toFiniteNumber(value.percent);

  return {
    type: "PLAYER_EVENT",
    data: {
      event: value.event === "complete" ? "ended" : "timeupdate",
      currentTime,
      duration,
      progress: progress ?? calculateProgress(currentTime, duration),
      mediaType: "tv",
      timestamp: Date.now()
    }
  };
}

function megaPlayWatchingLogToPlayerEvent(value: MegaPlayWatchingLogPayload): PlayerEventPayload {
  const currentTime = Math.max(0, toFiniteNumber(value.currentTime) ?? 0);
  const duration = Math.max(0, toFiniteNumber(value.duration) ?? 0);

  return {
    type: "PLAYER_EVENT",
    data: {
      event: "timeupdate",
      currentTime,
      duration,
      progress: calculateProgress(currentTime, duration),
      mediaType: "tv",
      timestamp: Date.now()
    }
  };
}

export function isKnownPlayerOrigin(origin: string): boolean {
  const provider = getProviderByOrigin(origin);
  return !!provider && !provider.unsafeWildcardOrigin;
}

export function isTrustedPlayerMessageOrigin(origin: string, expectedOrigin?: string): boolean {
  if (origin && expectedOrigin && origin === expectedOrigin) return true;
  return isKnownPlayerOrigin(origin);
}

export function parsePlayerMessage(
  raw: unknown,
  origin?: string,
  expectedOrigin?: string
): PlayerEventPayload | null {
  const normalizedOrigin = origin || "";
  if (normalizedOrigin && !isTrustedPlayerMessageOrigin(normalizedOrigin, expectedOrigin)) {
    return null;
  }

  const payload = parseMaybeJson(raw);
  if (payload === raw && typeof raw === "string") return null;

  if (isPlayerEventPayload(payload)) {
    return normalizePlayerEventPayload(payload);
  }

  if (isRecord(payload) && payload.type === "MEDIA_DATA") {
    const nested = parseMaybeJson(payload.data);
    const mediaData = unwrapMediaData(nested);
    return mediaData ? mediaDataToPlayerEvent(mediaData) : null;
  }

  const mediaData = unwrapMediaData(payload);
  if (mediaData) return mediaDataToPlayerEvent(mediaData);

  if (isRawProgressPayload(payload)) return rawProgressToPlayerEvent(payload);
  if (isMegaPlayTimePayload(payload)) return megaPlayTimeToPlayerEvent(payload);
  if (isMegaPlayWatchingLogPayload(payload)) return megaPlayWatchingLogToPlayerEvent(payload);

  return null;
}

export function calculateProgress(currentTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
}

export interface PlayerControls {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (level: number) => void;
  mute: (muted: boolean) => void;
  getStatus: () => void;
}

export type ProviderContentType = "movie" | "tv";

export type ProviderEmbedUrlProvider = Pick<
  ProviderCatalogEntry,
  "key" | "origins" | "progress" | "params"
>;

export interface ProviderEmbedUrlOptions {
  sourceUrl: string;
  provider?: ProviderEmbedUrlProvider;
  contentType: ProviderContentType;
  resumePositionSeconds?: number;
  watchCompleted?: boolean;
  baseUrl?: string;
}

export function shouldApplyProviderResume(
  providerKey: ProviderKey | string | undefined,
  contentType: ProviderContentType
) {
  if (!providerKey) return false;
  if (providerKey === "vidking" && contentType === "tv") return false;
  if (providerKey === "vidnest" && contentType === "tv") return false;
  return true;
}

export function shouldForceProviderStartPosition(providerKey: ProviderKey | string | undefined) {
  return providerKey === "vidfast";
}

export function applyProviderEmbedParams(
  url: URL,
  provider: ProviderEmbedUrlProvider | undefined,
  contentType: ProviderContentType
) {
  if (contentType !== "tv" || !provider?.params) return;

  const paramsSchema = provider.params;

  const setIfSupported = (key: string, value: string) => {
    if (key in paramsSchema) {
      url.searchParams.set(key, value);
    }
  };

  setIfSupported("nextButton", "false");
  setIfSupported("nextbutton", "false");
  setIfSupported("nextEpisode", "false");
  setIfSupported("nextepisode", "hide");

  setIfSupported("autoNext", "false");
  setIfSupported("autonext", "false");
  setIfSupported("autoplayNextEpisode", "false");

  setIfSupported("prevepisode", "hide");

  setIfSupported("episodelist", "false");
  setIfSupported("episodeSelector", "false");
  setIfSupported("episodeselector", "false");

  setIfSupported("hideServerControls", "true");
  setIfSupported("hideServer", "true");
}

export function createProviderEmbedUrl({
  sourceUrl,
  provider,
  contentType,
  resumePositionSeconds = 0,
  watchCompleted = false,
  baseUrl = "http://localhost"
}: ProviderEmbedUrlOptions) {
  try {
    const url = new URL(sourceUrl, baseUrl);
    const providerKey = provider?.key;
    const shouldResume =
      resumePositionSeconds > 0 &&
      !watchCompleted &&
      shouldApplyProviderResume(providerKey, contentType);

    applyProviderEmbedParams(url, provider, contentType);

    if (provider?.progress?.resumeParam && shouldForceProviderStartPosition(providerKey)) {
      url.searchParams.set(
        provider.progress.resumeParam,
        String(shouldResume ? resumePositionSeconds : 0)
      );
    } else if (shouldResume && provider?.progress?.resumeParam) {
      url.searchParams.set(provider.progress.resumeParam, String(resumePositionSeconds));
    }

    return url.toString();
  } catch {
    return sourceUrl;
  }
}

export function postMessageToPlayer(
  iframe: HTMLIFrameElement | null,
  command: string,
  params?: Record<string, unknown>
): void {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage({ command, ...params }, "*");
}

export function createPlayerControls(iframeRef: {
  current: HTMLIFrameElement | null;
}): PlayerControls {
  return {
    play: () => postMessageToPlayer(iframeRef.current, "play"),
    pause: () => postMessageToPlayer(iframeRef.current, "pause"),
    seek: (time: number) => postMessageToPlayer(iframeRef.current, "seek", { time }),
    setVolume: (level: number) => postMessageToPlayer(iframeRef.current, "volume", { level }),
    mute: (muted: boolean) => postMessageToPlayer(iframeRef.current, "mute", { muted }),
    getStatus: () => postMessageToPlayer(iframeRef.current, "getStatus")
  };
}
