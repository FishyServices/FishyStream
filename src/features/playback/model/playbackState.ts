import type { ContentPlayback } from "@content/contentMetadata";
import type { ProgressState } from "@/features/library/useWatchProgress";

export function safeSeason(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 1;
}

export function safeEpisode(value: number | null | undefined): number {
  return value != null && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

export function isMatchingEpisodeProgress(
  content: ContentPlayback,
  watchState: ProgressState | undefined,
  season: number,
  episode: number
): boolean {
  if (content.type !== "tv") return true;
  if (!watchState) return false;
  return (
    safeSeason(watchState.seasonNumber) === season &&
    safeEpisode(watchState.episodeNumber) === episode
  );
}

export function pickResumePositionSeconds(
  content: ContentPlayback,
  watchState: ProgressState | undefined,
  lastSyncedPosition: number,
  season: number,
  episode: number
): number {
  if (!isMatchingEpisodeProgress(content, watchState, season, episode)) return 0;
  return Math.floor(Math.max(0, watchState?.positionSeconds ?? 0, lastSyncedPosition));
}

export function clampProgress(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function getEffectiveAnimeDub(searchParams: URLSearchParams, prefersDub: boolean): boolean {
  if (searchParams.get("dub") === "true") return true;
  if (searchParams.get("dub") === "false") return false;
  return prefersDub;
}

export function setAnimeDubSearchParam(
  params: URLSearchParams,
  enabled: boolean,
  prefersDub: boolean
): void {
  if (enabled || prefersDub) params.set("dub", String(enabled));
  else params.delete("dub");
}
