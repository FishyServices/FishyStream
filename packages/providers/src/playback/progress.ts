import { clamp } from "../shared/math.js";

export type PlayerEventName = "timeupdate" | "play" | "pause" | "ended" | "seeked" | "playerstatus";

export interface PlaybackProgressSample {
  event: PlayerEventName;
  currentTime: number;
  duration: number;
  progress: number;
  sampledAt: number;
}

export const WATCH_PROGRESS_SYNC_INTERVAL_MS = 20 * 60_000;
export const WATCH_PROGRESS_STATUS_POLL_MS = 30_000;
export const WATCH_PROGRESS_MIN_LOCAL_SAMPLE_MS = 15_000;
export const WATCH_PROGRESS_MIN_POSITION_DELTA_SECONDS = 30;
export const WATCH_PROGRESS_MIN_PERCENT_DELTA = 2;

const MIN_FIRST_SAMPLE_SECONDS = 5;
const MIN_FIRST_SAMPLE_PERCENT = 1;

export function normalizePlaybackProgressSample(
  sample: Omit<PlaybackProgressSample, "sampledAt">
): PlaybackProgressSample {
  const duration = Number.isFinite(sample.duration) ? Math.max(0, sample.duration) : 0;
  const currentTime = Number.isFinite(sample.currentTime)
    ? clamp(sample.currentTime, 0, duration || sample.currentTime)
    : 0;
  const fallbackProgress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progress = clamp(
    Number.isFinite(sample.progress) ? sample.progress : fallbackProgress,
    0,
    100
  );

  return { ...sample, currentTime, duration, progress, sampledAt: Date.now() };
}

export function shouldStorePlaybackProgressSample(
  previous: PlaybackProgressSample | undefined,
  next: PlaybackProgressSample
): boolean {
  if (!previous) {
    return (
      next.currentTime >= MIN_FIRST_SAMPLE_SECONDS ||
      next.progress >= MIN_FIRST_SAMPLE_PERCENT ||
      next.event !== "timeupdate"
    );
  }
  if (next.event !== "timeupdate") return true;
  return (
    Math.abs(next.currentTime - previous.currentTime) >=
      WATCH_PROGRESS_MIN_POSITION_DELTA_SECONDS ||
    Math.abs(next.progress - previous.progress) >= WATCH_PROGRESS_MIN_PERCENT_DELTA ||
    next.sampledAt - previous.sampledAt >= WATCH_PROGRESS_MIN_LOCAL_SAMPLE_MS
  );
}
