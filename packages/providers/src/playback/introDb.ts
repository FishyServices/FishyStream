import { isRecord } from "../shared/guards.js";
import type { MediaType } from "../shared/media.js";

const INTRO_DB_MEDIA_URL = "https://api.theintrodb.org/v3/media";
const SEGMENT_KINDS = ["intro", "recap", "credits", "preview"] as const;

export type SkipSegmentKind = (typeof SEGMENT_KINDS)[number];

export interface IntroDbPlaybackLookup {
  tmdbId?: string;
  imdbId?: string;
  type: MediaType;
  season?: number;
  episode?: number;
  durationSeconds?: number;
  signal?: AbortSignal;
}

export interface PlaybackSkipSegment {
  kind: SkipSegmentKind;
  start: number;
  end: number;
}

interface RawTimestamp {
  start_ms: number | null;
  end_ms: number | null;
}

function parseTmdbId(value: string | undefined): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function isValidTime(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function readTimestamps(value: unknown): RawTimestamp[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): RawTimestamp[] =>
    isRecord(item) && isValidTime(item.start_ms) && isValidTime(item.end_ms)
      ? [{ start_ms: item.start_ms, end_ms: item.end_ms }]
      : []
  );
}

function buildMediaUrl(lookup: IntroDbPlaybackLookup): URL | undefined {
  const { tmdbId, imdbId, type, season, episode, durationSeconds } = lookup;
  const url = new URL(INTRO_DB_MEDIA_URL);
  const numericTmdbId = parseTmdbId(tmdbId);

  if (numericTmdbId) url.searchParams.set("tmdb_id", String(numericTmdbId));
  else if (imdbId) url.searchParams.set("imdb_id", imdbId);
  else return undefined;

  url.searchParams.set("type", type);
  if (type === "tv") {
    if (season === undefined || episode === undefined) return undefined;
    url.searchParams.set("season", String(season));
    url.searchParams.set("episode", String(episode));
  }
  if (durationSeconds !== undefined && durationSeconds > 0) {
    url.searchParams.set("duration_ms", String(Math.round(durationSeconds * 1000)));
  }
  return url;
}

function readSegments(payload: unknown, durationSeconds?: number): PlaybackSkipSegment[] {
  if (!isRecord(payload)) throw new Error("TheIntroDB returned an invalid media response.");
  return SEGMENT_KINDS.flatMap((kind) =>
    readTimestamps(payload[kind]).flatMap((timestamp): PlaybackSkipSegment[] => {
      const start = timestamp.start_ms === null ? 0 : timestamp.start_ms / 1000;
      const end = timestamp.end_ms === null ? durationSeconds : timestamp.end_ms / 1000;
      return end !== undefined && Number.isFinite(end) && end > start ? [{ kind, start, end }] : [];
    })
  );
}

export async function getIntroDbPlaybackSegments(
  lookup: IntroDbPlaybackLookup
): Promise<PlaybackSkipSegment[]> {
  const url = buildMediaUrl(lookup);
  if (!url) return [];

  const response = await fetch(url, { signal: lookup.signal });
  if (!response.ok) throw new Error(`TheIntroDB request failed with status ${response.status}.`);
  return readSegments(await response.json(), lookup.durationSeconds);
}
