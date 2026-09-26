const INTRO_DB_MEDIA_URL = "https://api.theintrodb.org/v3/media";

export interface IntroDbPlaybackLookup {
  tmdbId?: string;
  imdbId?: string;
  type: "movie" | "tv";
  season?: number;
  episode?: number;
  durationSeconds?: number;
  signal?: AbortSignal;
}

export interface PlaybackSkipSegment {
  kind: "intro" | "recap" | "credits" | "preview";
  start: number;
  end: number;
}

interface RawTimestamp {
  start_ms: number | null;
  end_ms: number | null;
}

interface RawMediaRecord {
  intro: RawTimestamp[];
  recap: RawTimestamp[];
  credits: RawTimestamp[];
  preview: RawTimestamp[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTmdbId(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function readTimestamp(value: unknown): RawTimestamp | undefined {
  if (!isRecord(value)) return undefined;
  const start = value.start_ms;
  const end = value.end_ms;
  const validTime = (time: unknown): time is number | null =>
    time === null || (typeof time === "number" && Number.isFinite(time) && time >= 0);

  return validTime(start) && validTime(end) ? { start_ms: start, end_ms: end } : undefined;
}

function readTimestampList(value: unknown): RawTimestamp[] {
  if (!Array.isArray(value)) return [];
  return value.map(readTimestamp).filter((timestamp): timestamp is RawTimestamp => !!timestamp);
}

function parseMediaResponse(value: unknown): RawMediaRecord {
  if (!isRecord(value)) throw new Error("TheIntroDB returned an invalid media response.");
  return {
    intro: readTimestampList(value.intro),
    recap: readTimestampList(value.recap),
    credits: readTimestampList(value.credits),
    preview: readTimestampList(value.preview)
  };
}

function buildMediaUrl({
  tmdbId,
  imdbId,
  type,
  season,
  episode,
  durationSeconds
}: Omit<IntroDbPlaybackLookup, "signal">) {
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

function toSeconds(value: number) {
  return value / 1000;
}

function readSegments(record: RawMediaRecord, durationSeconds: number | undefined) {
  const segmentGroups = [
    ["intro", record.intro],
    ["recap", record.recap],
    ["credits", record.credits],
    ["preview", record.preview]
  ] as const;
  const segments: PlaybackSkipSegment[] = [];

  for (const [kind, timestamps] of segmentGroups) {
    for (const timestamp of timestamps) {
      const start = timestamp.start_ms === null ? 0 : toSeconds(timestamp.start_ms);
      const end = timestamp.end_ms === null ? durationSeconds : toSeconds(timestamp.end_ms);
      if (end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        continue;
      }
      segments.push({ kind, start, end });
    }
  }

  return segments;
}

export async function getIntroDbPlaybackSegments({
  tmdbId,
  imdbId,
  type,
  season,
  episode,
  durationSeconds,
  signal
}: IntroDbPlaybackLookup): Promise<PlaybackSkipSegment[]> {
  const url = buildMediaUrl({
    tmdbId,
    imdbId,
    type,
    season,
    episode,
    durationSeconds
  });
  if (!url) return [];

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`TheIntroDB request failed with status ${response.status}.`);

  return readSegments(parseMediaResponse(await response.json()), durationSeconds);
}
