import { isRecord, toFiniteNumber } from "../shared/guards.js";
import { clamp } from "../shared/math.js";
import type { MediaType } from "../shared/media.js";
import { getProviderByOrigin } from "../streaming/registry.js";
import type { PlayerEventName } from "./progress.js";

export interface PlayerEventData {
  event: PlayerEventName;
  currentTime?: number;
  duration?: number;
  progress?: number;
  id?: string;
  tmdbId?: number;
  mediaType: MediaType;
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

type RawMediaKind = "movie" | "tv" | "anime";
type PayloadParser = (payload: unknown) => PlayerEventPayload | null;

const CINESRC_PREFIX = "cinesrc:";
const CINESRC_EVENTS: Readonly<Record<string, PlayerEventName>> = {
  play: "play",
  pause: "pause",
  timeupdate: "timeupdate",
  seeking: "seeked",
  seeked: "seeked",
  ended: "ended"
};

export function calculateProgress(currentTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return clamp((currentTime / duration) * 100, 0, 100);
}

function parseMaybeJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function isMediaKind(value: unknown): value is RawMediaKind {
  return value === "movie" || value === "tv" || value === "anime";
}

function toMediaType(value: unknown): MediaType {
  return value === "movie" ? "movie" : "tv";
}

function timeupdate(data: Omit<PlayerEventData, "event" | "timestamp">): PlayerEventPayload {
  return { type: "PLAYER_EVENT", data: { event: "timeupdate", ...data, timestamp: Date.now() } };
}

const parsePlayerEvent: PayloadParser = (payload) => {
  if (!isRecord(payload) || payload.type !== "PLAYER_EVENT" || !isRecord(payload.data)) return null;
  if (typeof payload.data.event !== "string") return null;
  const data = payload.data as unknown as PlayerEventData;
  return {
    type: "PLAYER_EVENT",
    data: {
      ...data,
      mediaType: toMediaType(data.mediaType),
      season: toFiniteNumber(data.season),
      episode: toFiniteNumber(data.episode)
    }
  };
};

function unwrapMediaRecord(value: unknown): Record<string, unknown> | null {
  const isMediaRecord = (candidate: unknown): candidate is Record<string, unknown> =>
    isRecord(candidate) &&
    isRecord(candidate.progress) &&
    candidate.id !== undefined &&
    isMediaKind(candidate.type) &&
    toFiniteNumber(candidate.progress.watched) !== undefined &&
    toFiniteNumber(candidate.progress.duration) !== undefined;

  if (isMediaRecord(value)) return value;
  if (!isRecord(value)) return null;
  const first = Object.values(value)[0];
  return isMediaRecord(first) ? first : null;
}

function mediaRecordToEvent(record: Record<string, unknown>): PlayerEventPayload {
  const progress = record.progress as Record<string, unknown>;
  const watched = toFiniteNumber(progress.watched) ?? 0;
  const duration = toFiniteNumber(progress.duration) ?? 0;
  return timeupdate({
    currentTime: watched,
    duration,
    progress: toFiniteNumber(progress.percentage) ?? calculateProgress(watched, duration),
    id: String(record.id),
    mediaType: toMediaType(record.mediaType ?? record.type)
  });
}

const parseMediaData: PayloadParser = (payload) => {
  const source =
    isRecord(payload) && payload.type === "MEDIA_DATA" ? parseMaybeJson(payload.data) : payload;
  const record = unwrapMediaRecord(source);
  return record ? mediaRecordToEvent(record) : null;
};

const parseRawProgress: PayloadParser = (payload) => {
  if (!isRecord(payload) || payload.id === undefined || !isMediaKind(payload.type)) return null;
  const progress = toFiniteNumber(payload.progress);
  const currentTime = toFiniteNumber(payload.timestamp);
  const duration = toFiniteNumber(payload.duration);
  if (progress === undefined || currentTime === undefined || duration === undefined) return null;
  return timeupdate({
    currentTime,
    duration,
    progress,
    id: String(payload.id),
    mediaType: toMediaType(payload.type),
    season: toFiniteNumber(payload.season),
    episode: toFiniteNumber(payload.episode)
  });
};

const parseMegaPlayTime: PayloadParser = (payload) => {
  if (!isRecord(payload)) return null;
  const { event } = payload;
  if (event !== "time" && event !== "complete" && event !== "error") return null;
  const time = toFiniteNumber(payload.time);
  const duration = toFiniteNumber(payload.duration);
  const percent = toFiniteNumber(payload.percent);
  if (time === undefined && duration === undefined && percent === undefined) return null;

  const currentTime = Math.max(0, time ?? 0);
  const total = Math.max(0, duration ?? 0);
  return {
    type: "PLAYER_EVENT",
    data: {
      event: event === "complete" ? "ended" : "timeupdate",
      currentTime,
      duration: total,
      progress: percent ?? calculateProgress(currentTime, total),
      mediaType: "tv",
      timestamp: Date.now()
    }
  };
};

const parseMegaPlayWatchingLog: PayloadParser = (payload) => {
  if (!isRecord(payload) || payload.type !== "watching-log") return null;
  const time = toFiniteNumber(payload.currentTime);
  const duration = toFiniteNumber(payload.duration);
  if (time === undefined && duration === undefined) return null;

  const currentTime = Math.max(0, time ?? 0);
  const total = Math.max(0, duration ?? 0);
  return timeupdate({
    currentTime,
    duration: total,
    progress: calculateProgress(currentTime, total),
    mediaType: "tv"
  });
};

const parseCineSrc: PayloadParser = (payload) => {
  if (!isRecord(payload) || typeof payload.type !== "string") return null;
  if (!payload.type.startsWith(CINESRC_PREFIX)) return null;
  const event = CINESRC_EVENTS[payload.type.slice(CINESRC_PREFIX.length)];
  if (!event) return null;

  const rawTime = toFiniteNumber(payload.currentTime);
  const rawDuration = toFiniteNumber(payload.duration);
  return {
    type: "PLAYER_EVENT",
    data: {
      event,
      currentTime: rawTime === undefined ? undefined : Math.max(0, rawTime),
      duration: rawDuration === undefined ? undefined : Math.max(0, rawDuration),
      progress:
        rawTime === undefined || rawDuration === undefined
          ? undefined
          : calculateProgress(rawTime, rawDuration),
      mediaType: "tv",
      volume: toFiniteNumber(payload.volume),
      muted: typeof payload.muted === "boolean" ? payload.muted : undefined,
      timestamp: Date.now()
    }
  };
};

const PARSERS: readonly PayloadParser[] = [
  parsePlayerEvent,
  parseMediaData,
  parseRawProgress,
  parseMegaPlayTime,
  parseMegaPlayWatchingLog,
  parseCineSrc
];

export function isKnownPlayerOrigin(origin: string): boolean {
  return getProviderByOrigin(origin) !== undefined;
}

export function isTrustedPlayerMessageOrigin(origin: string, expectedOrigin?: string): boolean {
  return (!!origin && origin === expectedOrigin) || isKnownPlayerOrigin(origin);
}

export function parsePlayerMessage(
  raw: unknown,
  origin?: string,
  expectedOrigin?: string
): PlayerEventPayload | null {
  if (origin && !isTrustedPlayerMessageOrigin(origin, expectedOrigin)) return null;

  const payload = parseMaybeJson(raw);
  if (typeof raw === "string" && payload === raw) return null;

  for (const parse of PARSERS) {
    const event = parse(payload);
    if (event) return event;
  }
  return null;
}
