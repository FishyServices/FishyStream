export interface PlaybackProgressSample {
  event: "timeupdate" | "play" | "pause" | "ended" | "seeked" | "playerstatus";
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

export function normalizePlaybackProgressSample(
  sample: Omit<PlaybackProgressSample, "sampledAt">
): PlaybackProgressSample {
  const duration = Number.isFinite(sample.duration) ? Math.max(0, sample.duration) : 0;
  const currentTime = Number.isFinite(sample.currentTime)
    ? Math.max(0, Math.min(sample.currentTime, duration || sample.currentTime))
    : 0;
  const progress = Number.isFinite(sample.progress)
    ? Math.max(0, Math.min(100, sample.progress))
    : duration > 0
      ? Math.max(0, Math.min(100, (currentTime / duration) * 100))
      : 0;

  return {
    ...sample,
    currentTime,
    duration,
    progress,
    sampledAt: Date.now()
  };
}

export function shouldStorePlaybackProgressSample(
  previous: PlaybackProgressSample | undefined,
  next: PlaybackProgressSample
) {
  if (!previous) return next.currentTime >= 5 || next.progress >= 1 || next.event !== "timeupdate";
  if (next.event !== "timeupdate") return true;
  if (
    Math.abs(next.currentTime - previous.currentTime) >= WATCH_PROGRESS_MIN_POSITION_DELTA_SECONDS
  ) {
    return true;
  }
  if (Math.abs(next.progress - previous.progress) >= WATCH_PROGRESS_MIN_PERCENT_DELTA) return true;
  return next.sampledAt - previous.sampledAt >= WATCH_PROGRESS_MIN_LOCAL_SAMPLE_MS;
}
