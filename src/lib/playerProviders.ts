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

export interface MediaDataPayload {
  type: "MEDIA_DATA";
  data: Record<string, VideasyMediaData> | ProviderMediaData;
}

export interface VideasyMediaData {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  progress: { duration: number; watched: number };
  last_season_watched?: number;
  last_episode_watched?: number;
  show_progress?: Record<
    string,
    {
      season: string;
      episode: string;
      progress: { watched: number; duration: number };
      last_updated?: number;
    }
  >;
}

export interface VideasyPayload {
  id: string | number;
  type: "movie" | "tv" | "anime";
  progress: number;
  timestamp: number;
  duration: number;
  season?: number;
  episode?: number;
}

export interface ProviderMediaData {
  id: string | number;
  type: "movie" | "tv" | "anime";
  title?: string;
  progress: {
    watched: number;
    duration: number;
    percentage?: number;
  };
  last_season_watched?: number | string;
  last_episode_watched?: number | string;
  show_progress?: Record<
    string,
    {
      season: number | string;
      episode: number | string;
      progress: { watched: number; duration: number; percentage?: number };
      last_updated?: number;
    }
  >;
}

const VIDFAST_ORIGINS = [
  "https://vidfast.pro",
  "https://vidfast.in",
  "https://vidfast.io",
  "https://vidfast.me",
  "https://vidfast.net",
  "https://vidfast.pm",
  "https://vidfast.xyz"
];

const VIDEASY_ORIGINS = ["https://player.videasy.net", "https://videasy.net"];
const MOSTREAM_ORIGINS = ["https://mostream.us"];
const VIDAPI_ORIGINS = ["https://vidapi.qzz.io"];
const VIDNEST_ORIGINS = ["https://vidnest.fun"];

export function isVidFastOrigin(origin: string): boolean {
  return VIDFAST_ORIGINS.includes(origin);
}

export function isVideasyOrigin(origin: string): boolean {
  return VIDEASY_ORIGINS.includes(origin);
}

export function isMoStreamOrigin(origin: string): boolean {
  return MOSTREAM_ORIGINS.includes(origin);
}

export function isVidApiOrigin(origin: string): boolean {
  return VIDAPI_ORIGINS.includes(origin);
}

export function isVidNestOrigin(origin: string): boolean {
  return VIDNEST_ORIGINS.includes(origin);
}

function isVideasyPayload(p: unknown): p is VideasyPayload {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  return (
    (obj.id !== undefined || obj.progress !== undefined || obj.timestamp !== undefined) &&
    (obj.type === "movie" || obj.type === "tv" || obj.type === "anime")
  );
}

function parseVideasyMediaData(p: any): PlayerEventPayload | null {
  try {
    const mediaData: Record<string, VideasyMediaData> =
      typeof p.data === "string" ? JSON.parse(p.data) : p.data;

    if (!mediaData || typeof mediaData !== "object") return null;

    const entries = Object.entries(mediaData);
    if (entries.length === 0) return null;

    const entry = entries[0];
    if (!entry) return null;
    const data = entry[1];
    if (!data || typeof data !== "object") return null;

    const watched = data.progress?.watched ?? 0;
    const duration = data.progress?.duration ?? 0;
    const progressPercent = duration > 0 ? (watched / duration) * 100 : 0;

    return {
      type: "PLAYER_EVENT",
      data: {
        event: "timeupdate",
        currentTime: watched,
        duration: duration,
        progress: progressPercent,
        id: String(data.id),
        mediaType: data.mediaType,
        season: data.last_season_watched,
        episode: data.last_episode_watched,
        timestamp: Date.now()
      }
    };
  } catch {
    return null;
  }
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function isProviderMediaData(p: unknown): p is ProviderMediaData {
  if (!p || typeof p !== "object") return false;
  const obj = p as Record<string, unknown>;
  const progress = obj.progress;

  return (
    obj.id !== undefined &&
    (obj.type === "movie" || obj.type === "tv" || obj.type === "anime") &&
    !!progress &&
    typeof progress === "object" &&
    toFiniteNumber((progress as Record<string, unknown>).watched) !== undefined &&
    toFiniteNumber((progress as Record<string, unknown>).duration) !== undefined
  );
}

function parseProviderMediaData(p: ProviderMediaData): PlayerEventPayload | null {
  const watched = toFiniteNumber(p.progress.watched) ?? 0;
  const duration = toFiniteNumber(p.progress.duration) ?? 0;
  const explicitProgress = toFiniteNumber(p.progress.percentage);

  return {
    type: "PLAYER_EVENT",
    data: {
      event: "timeupdate",
      currentTime: watched,
      duration,
      progress: explicitProgress ?? (duration > 0 ? (watched / duration) * 100 : 0),
      id: String(p.id),
      mediaType: p.type === "anime" ? "tv" : p.type,
      season: toFiniteNumber(p.last_season_watched),
      episode: toFiniteNumber(p.last_episode_watched),
      timestamp: Date.now()
    }
  };
}

function normalizePlayerEventPayload(
  payload: PlayerEventPayload,
  origin: string
): PlayerEventPayload {
  const isKnownAnimeCapableOrigin =
    isVideasyOrigin(origin) ||
    isMoStreamOrigin(origin) ||
    isVidApiOrigin(origin) ||
    isVidNestOrigin(origin);

  if (!isKnownAnimeCapableOrigin) return payload;

  const rawData = payload.data as PlayerEventData & {
    mediaType?: string;
    type?: "movie" | "tv" | "anime";
    season?: number | string;
    episode?: number | string;
  };

  const mediaType = (rawData.mediaType ?? rawData.type) as string | undefined;

  const normalizedMediaType: "movie" | "tv" = mediaType === "movie" ? "movie" : "tv";

  return {
    type: "PLAYER_EVENT",
    data: {
      ...payload.data,
      mediaType: normalizedMediaType,
      season: toFiniteNumber(rawData.season),
      episode: toFiniteNumber(rawData.episode)
    }
  };
}

export function parsePlayerMessage(
  raw: unknown,
  origin?: string,
  currentContentId?: string
): PlayerEventPayload | MediaDataPayload | null {
  try {
    const normalizedOrigin = origin || "";
    const isVideasyLike = isVideasyOrigin(normalizedOrigin) || isMoStreamOrigin(normalizedOrigin);
    const isProviderLike = isVidApiOrigin(normalizedOrigin) || isVidNestOrigin(normalizedOrigin);
    const p = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!p || typeof p !== "object") return null;

    if ((p as PlayerEventPayload | MediaDataPayload).type === "PLAYER_EVENT") {
      return normalizePlayerEventPayload(p as PlayerEventPayload, normalizedOrigin);
    }

    if ((p as PlayerEventPayload | MediaDataPayload).type === "MEDIA_DATA" && !isVideasyLike) {
      return p as MediaDataPayload;
    }

    if (isVideasyLike && (p as any).type === "MEDIA_DATA") {
      return parseVideasyMediaData(p);
    }

    if (isVideasyLike && isVideasyPayload(p)) {
      return {
        type: "PLAYER_EVENT",
        data: {
          event: "timeupdate",
          currentTime: p.timestamp,
          duration: p.duration,
          progress: p.progress,
          id: String(p.id),
          mediaType: p.type === "anime" ? "tv" : p.type,
          season: p.season,
          episode: p.episode,
          timestamp: Date.now()
        }
      };
    }

    if (
      isProviderLike &&
      (p as any).type === "MEDIA_DATA" &&
      isProviderMediaData((p as any).data)
    ) {
      return parseProviderMediaData((p as any).data);
    }

    if (isProviderLike && isProviderMediaData(p)) {
      return parseProviderMediaData(p);
    }

    return null;
  } catch {
    return null;
  }
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

export function postMessageToPlayer(
  iframe: HTMLIFrameElement | null,
  command: string,
  params?: Record<string, unknown>
): void {
  if (!iframe?.contentWindow) return;
  const msg = { command, ...params };
  iframe.contentWindow.postMessage(msg, "*");
}

export function createPlayerControls(
  iframeRef: React.RefObject<HTMLIFrameElement | null>
): PlayerControls {
  return {
    play: () => postMessageToPlayer(iframeRef.current, "play"),
    pause: () => postMessageToPlayer(iframeRef.current, "pause"),
    seek: (time: number) => postMessageToPlayer(iframeRef.current, "seek", { time }),
    setVolume: (level: number) => postMessageToPlayer(iframeRef.current, "volume", { level }),
    mute: (muted: boolean) => postMessageToPlayer(iframeRef.current, "mute", { muted }),
    getStatus: () => postMessageToPlayer(iframeRef.current, "getStatus")
  };
}
