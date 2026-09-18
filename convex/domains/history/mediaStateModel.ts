import type { Doc } from "../../_generated/dataModel";
import {
  fromImageWire,
  makeContentId,
  parseContentId,
  type WatchHistoryItemMeta,
  type WatchProgressEntryMeta
} from "@content/contentMetadata";

export const COMPLETION_PERCENT = 95;

export function progressPercent(
  row: Pick<Doc<"mediaState">, "positionSeconds" | "durationSeconds">
) {
  if (row.durationSeconds == null || row.positionSeconds == null || row.durationSeconds <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, (row.positionSeconds / row.durationSeconds) * 100));
}

export function isCompleted(progress: number) {
  return progress >= COMPLETION_PERCENT;
}

export function toHistoryItem(row: Doc<"mediaState">): WatchHistoryItemMeta | null {
  const parsed = parseContentId(row.contentId);
  if (!parsed) return null;

  const progress = progressPercent(row);
  return {
    _id: makeContentId(parsed.type, parsed.tmdbId),
    title: row.title,
    type: parsed.type,
    posterUrl: fromImageWire(row.posterUrl),
    tmdbId: parsed.tmdbId,
    new: false,
    progress,
    completed: isCompleted(progress),
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    source: row.source,
    dub: row.dub
  };
}

export function toProgressEntry(row: Doc<"mediaState">): WatchProgressEntryMeta | null {
  const parsed = parseContentId(row.contentId);
  if (!parsed) return null;

  const progress = progressPercent(row);
  return {
    contentId: makeContentId(parsed.type, parsed.tmdbId),
    progress,
    positionSeconds: row.positionSeconds ?? 0,
    durationSeconds: row.durationSeconds ?? 0,
    completed: isCompleted(progress),
    watchedAt: row.watchedAt ?? row._creationTime,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    source: row.source,
    dub: row.dub
  };
}

export function normalizeLimit(value: number | undefined, fallback: number, maximum: number) {
  return Math.max(1, Math.min(maximum, Math.floor(value ?? fallback)));
}

export function normalizeSearch(value: string | undefined) {
  return (
    value
      ?.trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "") ?? ""
  );
}
