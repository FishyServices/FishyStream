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

const PLAYER_EVENTS = new Set<PlayerEventName>([
  "timeupdate",
  "play",
  "pause",
  "ended",
  "seeked",
  "playerstatus"
]);

export function calculateProgress(currentTime: number, duration: number): number {
  if (!duration || duration <= 0) return 0;
  return clamp((currentTime / duration) * 100, 0, 100);
}

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

  const parseJson = (value: unknown): unknown => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  };
  let message = parseJson(raw);
  if (!isRecord(message)) return null;

  let body: unknown = message.data ?? message;
  if (isRecord(body) && typeof body.encoding === "string" && typeof body.data === "string") {
    if (body.encoding.toLowerCase() === "hex") {
      if (!/^(?:[\da-f]{2})+$/i.test(body.data)) return null;
      try {
        const bytes = Uint8Array.from(body.data.match(/.{2}/g) ?? [], (byte) =>
          Number.parseInt(byte, 16)
        );
        body = new TextDecoder().decode(bytes);
      } catch {
        return null;
      }
    } else {
      body = body.data;
    }
  }
  body = parseJson(body);
  if (!isRecord(body)) return null;

  const findProgressRecord = (value: unknown, depth = 0): Record<string, unknown> | undefined => {
    if (!isRecord(value) || depth > 3) return undefined;
    if (
      isRecord(value.progress) &&
      value.id !== undefined &&
      toFiniteNumber(value.progress.watched) !== undefined &&
      toFiniteNumber(value.progress.duration) !== undefined
    )
      return value;
    for (const child of Object.values(value)) {
      const nested = findProgressRecord(child, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  };
  const mediaRecord = findProgressRecord(body);
  const mediaProgress =
    mediaRecord && isRecord(mediaRecord.progress) ? mediaRecord.progress : undefined;

  const nestedData = isRecord(body.data) ? body.data : undefined;
  const details = mediaProgress ?? nestedData ?? body;
  const playerInfo = isRecord(details.player_info) ? details.player_info : undefined;
  const rawType =
    typeof body.type === "string"
      ? body.type
      : typeof message.type === "string"
        ? message.type
        : "";
  const eventCandidate =
    details.event ??
    body.event ??
    (rawType.includes(":") ? rawType.slice(rawType.lastIndexOf(":") + 1) : rawType);
  const eventAliases: Readonly<Record<string, PlayerEventName>> = {
    time: "timeupdate",
    complete: "ended",
    seeking: "seeked",
    playing: "timeupdate",
    paused: "pause",
    completed: "ended",
    seeked: "seeked"
  };
  let event = PLAYER_EVENTS.has(eventCandidate as PlayerEventName)
    ? (eventCandidate as PlayerEventName)
    : typeof eventCandidate === "string"
      ? eventAliases[eventCandidate]
      : undefined;
  if (!event && mediaRecord) event = "timeupdate";

  const status = typeof details.player_status === "string" ? details.player_status : undefined;
  if (!event && status) event = eventAliases[status];
  const isMediaType = (value: unknown): value is "movie" | "tv" | "anime" =>
    value === "movie" || value === "tv" || value === "anime";
  const hasPlaybackPosition =
    toFiniteNumber(details.currentTime ?? details.time ?? details.player_progress) !== undefined ||
    toFiniteNumber(mediaProgress?.watched) !== undefined ||
    (isMediaType(body.type) && toFiniteNumber(body.timestamp) !== undefined);
  if (!event && hasPlaybackPosition) event = "timeupdate";
  if (!event) return null;

  const currentTimeValue =
    mediaProgress?.watched ??
    details.currentTime ??
    details.time ??
    details.player_progress ??
    (isMediaType(body.type) ? body.timestamp : undefined);
  const durationValue =
    mediaProgress?.duration ?? details.duration ?? details.player_duration ?? body.duration;
  const percentValue = mediaProgress?.percentage ?? details.percent ?? details.progress;
  const currentTime = toFiniteNumber(currentTimeValue);
  const duration = toFiniteNumber(durationValue);
  const percent = toFiniteNumber(percentValue);
  const progress =
    percent !== undefined
      ? clamp(details.percent === percentValue && percent <= 1 ? percent * 100 : percent, 0, 100)
      : currentTime !== undefined && duration !== undefined
        ? calculateProgress(currentTime, duration)
        : undefined;

  return {
    type: "PLAYER_EVENT",
    data: {
      event,
      currentTime: currentTime === undefined ? undefined : Math.max(0, currentTime),
      duration: duration === undefined ? undefined : Math.max(0, duration),
      progress,
      id:
        mediaRecord?.id === undefined && details.mediaId === undefined && details.id === undefined
          ? playerInfo?.tmdb === undefined && playerInfo?.imdb === undefined
            ? undefined
            : String(playerInfo.tmdb ?? playerInfo.imdb)
          : String(mediaRecord?.id ?? details.mediaId ?? details.id),
      tmdbId: toFiniteNumber(details.tmdbId),
      mediaType:
        (mediaRecord?.mediaType ?? mediaRecord?.type ?? details.mediaType ?? details.type) ===
        "movie"
          ? "movie"
          : "tv",
      season: toFiniteNumber(mediaRecord?.season ?? details.season ?? playerInfo?.season),
      episode: toFiniteNumber(mediaRecord?.episode ?? details.episode ?? playerInfo?.episode),
      timestamp: toFiniteNumber(details.timestamp) ?? Date.now(),
      playing: typeof details.playing === "boolean" ? details.playing : status === "playing",
      muted: typeof details.muted === "boolean" ? details.muted : undefined,
      volume: toFiniteNumber(details.volume)
    }
  };
}
