import { parseContentId, type ContentId, type ContentType } from "@content/contentMetadata";
import type { AnimeReleaseScheduleEntry } from "@fishy/providers/anime";
import {
  getLocalStorageItem,
  removeLocalStorageItemsByPrefix,
  setLocalStorageItem
} from "./browserStorage";

export type LocalContentSnapshot = {
  title: string;
  type: ContentType;
  posterUrl: string;
  tmdbId: string;
  genre?: string[];
  year?: number;
  voteAverage?: number;
  bookmarkFolder?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLocalContentSnapshot(value: unknown): value is LocalContentSnapshot {
  if (!isRecord(value)) return false;
  return (
    typeof value.title === "string" &&
    (value.type === "movie" || value.type === "tv") &&
    typeof value.posterUrl === "string" &&
    typeof value.tmdbId === "string" &&
    (value.genre === undefined ||
      (Array.isArray(value.genre) && value.genre.every((genre) => typeof genre === "string"))) &&
    (value.year === undefined || typeof value.year === "number") &&
    (value.voteAverage === undefined || typeof value.voteAverage === "number") &&
    (value.bookmarkFolder === undefined || typeof value.bookmarkFolder === "string")
  );
}

function isContentId(value: unknown): value is ContentId {
  return typeof value === "string" && parseContentId(value) !== null;
}

function isStoredProgress(value: unknown): value is StoredProgress {
  if (!isRecord(value)) return false;
  return (
    typeof value.progress === "number" &&
    typeof value.positionSeconds === "number" &&
    typeof value.durationSeconds === "number" &&
    typeof value.completed === "boolean" &&
    (value.seasonNumber === undefined || typeof value.seasonNumber === "number") &&
    (value.episodeNumber === undefined || typeof value.episodeNumber === "number") &&
    (value.source === undefined || typeof value.source === "string") &&
    (value.dub === undefined || typeof value.dub === "boolean") &&
    (value.snapshot === undefined || isLocalContentSnapshot(value.snapshot)) &&
    typeof value.clientUpdatedAt === "number" &&
    typeof value.contentId === "string" &&
    parseContentId(value.contentId) !== null &&
    typeof value.dirty === "boolean" &&
    (value.syncedClientUpdatedAt === undefined || typeof value.syncedClientUpdatedAt === "number")
  );
}

function readJson(key: string): unknown {
  const raw = getLocalStorageItem(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    setLocalStorageItem(key, JSON.stringify(value));
  } catch {}
}

// --- Bookmark ---
const GUEST_BOOKMARK_IDS_KEY = "fishystream:library:guest-bookmark-ids";
const GUEST_BOOKMARK_SNAPSHOTS_KEY = "fishystream:library:guest-bookmark-snapshots";
const BOOKMARK_CACHE_PREFIX = "fishystream:library:bookmark-cache:";
const RELEASE_CACHE_KEY = "fishystream:library:release-cache";
const OBSOLETE_RELEASE_CACHE_PREFIXES = [
  "fishystream:library:anime-release-cache",
  "fishystream:library:tv-release-cache:"
];
const ANIME_RELEASE_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const TV_RELEASE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TvUpcomingEpisode = {
  name: string;
  airDate: string;
  seasonNumber: number;
  episodeNumber: number;
};

export type TvReleaseCacheEntry = { episode: TvUpcomingEpisode | null; available: boolean };

type AnimeReleaseCacheEntry = {
  cachedAt: number;
  schedules: AnimeReleaseScheduleEntry[];
};

type TvReleaseCacheRecord = Record<string, { cachedAt: number; episode: TvUpcomingEpisode | null }>;

function readReleaseCache(): Record<string, unknown> {
  removeLocalStorageItemsByPrefix(OBSOLETE_RELEASE_CACHE_PREFIXES);
  const value = readJson(RELEASE_CACHE_KEY);
  return isRecord(value) ? value : {};
}

function isAnimeReleaseSchedule(value: unknown): value is AnimeReleaseScheduleEntry {
  if (!isRecord(value)) return false;
  const isRelease = (release: unknown) =>
    isRecord(release) &&
    typeof release.episode === "number" &&
    typeof release.date === "string" &&
    (release.platform === null || typeof release.platform === "string") &&
    typeof release.estimated === "boolean";
  return (
    typeof value.contentId === "string" &&
    typeof value.title === "string" &&
    typeof value.matched === "boolean" &&
    (value.status === null || typeof value.status === "string") &&
    Array.isArray(value.sub) &&
    value.sub.every(isRelease) &&
    Array.isArray(value.dub) &&
    value.dub.every(isRelease) &&
    (value.dubProgress === null || typeof value.dubProgress === "string") &&
    (value.dubbedEpisodes === null || typeof value.dubbedEpisodes === "number") &&
    (value.totalEpisodes === null || typeof value.totalEpisodes === "number") &&
    (value.dubConfidence === null || typeof value.dubConfidence === "number") &&
    (value.dubReason === null || typeof value.dubReason === "string") &&
    (value.dubVerifiedAt === null || typeof value.dubVerifiedAt === "string")
  );
}

export function getCachedAnimeReleaseSchedules(
  selectedIds: readonly string[],
  now = Date.now()
): AnimeReleaseScheduleEntry[] {
  const entries = readReleaseCache().animeByContentId;
  if (!isRecord(entries)) return [];
  return selectedIds.flatMap((contentId) => {
    const entry = entries[contentId];
    return isAnimeReleaseCacheEntry(entry, contentId, now) ? entry.schedules : [];
  });
}

export function getUncachedAnimeReleaseIds(
  selectedIds: readonly string[],
  now = Date.now()
): string[] {
  const entries = readReleaseCache().animeByContentId;
  return selectedIds.filter((contentId) => {
    if (!isRecord(entries)) return true;
    return !isAnimeReleaseCacheEntry(entries[contentId], contentId, now);
  });
}

function isAnimeReleaseCacheEntry(
  value: unknown,
  contentId: string,
  now: number
): value is AnimeReleaseCacheEntry {
  return (
    isRecord(value) &&
    typeof value.cachedAt === "number" &&
    now - value.cachedAt <= ANIME_RELEASE_CACHE_MAX_AGE_MS &&
    Array.isArray(value.schedules) &&
    value.schedules.every(
      (schedule) => isAnimeReleaseSchedule(schedule) && schedule.contentId === contentId
    )
  );
}

export function setCachedAnimeReleaseSchedules(
  selectedIds: readonly string[],
  schedules: readonly AnimeReleaseScheduleEntry[],
  cachedAt = Date.now()
): void {
  const root = readReleaseCache();
  const previous = isRecord(root.animeByContentId) ? root.animeByContentId : {};
  const cache: Record<string, AnimeReleaseCacheEntry> = Object.fromEntries(
    Object.entries(previous).filter(([contentId, value]) =>
      isAnimeReleaseCacheEntry(value, contentId, cachedAt)
    )
  ) as Record<string, AnimeReleaseCacheEntry>;
  const schedulesByContentId = new Map<string, AnimeReleaseScheduleEntry[]>();
  for (const schedule of schedules) {
    const entries = schedulesByContentId.get(schedule.contentId) ?? [];
    entries.push(schedule);
    schedulesByContentId.set(schedule.contentId, entries);
  }
  for (const contentId of selectedIds) {
    cache[contentId] = { cachedAt, schedules: schedulesByContentId.get(contentId) ?? [] };
  }
  const rest = { ...root };
  delete rest.anime;
  writeJson(RELEASE_CACHE_KEY, { ...rest, animeByContentId: cache });
}

export function getCachedTvRelease(tmdbId: string, now = Date.now()): TvReleaseCacheEntry | null {
  const value = readReleaseCache().tv;
  const entry = isRecord(value) ? value[tmdbId] : undefined;
  if (
    !isRecord(entry) ||
    typeof entry.cachedAt !== "number" ||
    now - entry.cachedAt > TV_RELEASE_CACHE_MAX_AGE_MS ||
    typeof entry.available !== "boolean" ||
    !(entry.episode === null || isTvUpcomingEpisode(entry.episode))
  ) {
    return null;
  }
  return { episode: entry.episode, available: entry.available };
}

function isTvUpcomingEpisode(value: unknown): value is TvUpcomingEpisode {
  return (
    isRecord(value) &&
    typeof value.name === "string" &&
    typeof value.airDate === "string" &&
    typeof value.seasonNumber === "number" &&
    typeof value.episodeNumber === "number"
  );
}

export function setCachedTvRelease(
  tmdbId: string,
  release: TvReleaseCacheEntry,
  cachedAt = Date.now()
): void {
  const cache = readReleaseCache();
  const existing = isRecord(cache.tv) ? (cache.tv as TvReleaseCacheRecord) : {};
  const tv = Object.fromEntries(
    Object.entries(existing).filter(
      ([, entry]) =>
        isRecord(entry) &&
        typeof entry.cachedAt === "number" &&
        cachedAt - entry.cachedAt <= TV_RELEASE_CACHE_MAX_AGE_MS
    )
  );
  tv[tmdbId] = { cachedAt, ...release };
  writeJson(RELEASE_CACHE_KEY, { ...cache, tv });
}

export type BookmarkCache = {
  ids: ContentId[];
  snapshots: Record<string, LocalContentSnapshot>;
};

export function getBookmarkIds(): ContentId[] {
  const value = readJson(GUEST_BOOKMARK_IDS_KEY);
  return Array.isArray(value) ? value.filter(isContentId) : [];
}

export function setBookmarkIds(ids: readonly string[]) {
  writeJson(GUEST_BOOKMARK_IDS_KEY, ids);
}

export function getBookmarkSnapshots(): Record<string, LocalContentSnapshot> {
  const value = readJson(GUEST_BOOKMARK_SNAPSHOTS_KEY);
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, LocalContentSnapshot] =>
      isLocalContentSnapshot(entry[1])
    )
  );
}

export function setBookmarkSnapshots(snapshots: Record<string, LocalContentSnapshot>) {
  writeJson(GUEST_BOOKMARK_SNAPSHOTS_KEY, snapshots);
}

function getBookmarkCacheKey(userId: string) {
  return `${BOOKMARK_CACHE_PREFIX}${userId}`;
}

export function getBookmarkCache(userId: string): BookmarkCache {
  const value = readJson(getBookmarkCacheKey(userId));
  if (!isRecord(value) || !Array.isArray(value.ids) || !isRecord(value.snapshots)) {
    return { ids: [], snapshots: {} };
  }
  return {
    ids: value.ids.filter(isContentId),
    snapshots: Object.fromEntries(
      Object.entries(value.snapshots).filter((entry): entry is [string, LocalContentSnapshot] =>
        isLocalContentSnapshot(entry[1])
      )
    )
  };
}

export function setBookmarkCache(userId: string, cache: BookmarkCache) {
  writeJson(getBookmarkCacheKey(userId), cache);
}

// --- Watch Progress ---
const WATCH_PROGRESS_KEY = "fishystream:library:watch-progress";

export interface ProgressState {
  progress: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
  source?: string;
  dub?: boolean;
  snapshot?: LocalContentSnapshot;
  clientUpdatedAt: number;
}

export interface StoredProgress extends ProgressState {
  contentId: string;
  dirty: boolean;
  syncedClientUpdatedAt?: number;
}

export type ProgressStore = {
  version: 3;
  entries: StoredProgress[];
};

export function getWatchProgressStore(): ProgressStore | null {
  const value = readJson(WATCH_PROGRESS_KEY);
  if (
    !isRecord(value) ||
    value.version !== 3 ||
    !Array.isArray(value.entries) ||
    !value.entries.every(isStoredProgress)
  ) {
    return null;
  }
  return { version: 3, entries: value.entries };
}

export function setWatchProgressStore(store: ProgressStore) {
  writeJson(WATCH_PROGRESS_KEY, store);
}

export function removeWatchProgressEntry(contentId: string) {
  const store = getWatchProgressStore();
  if (!store) return;
  setWatchProgressStore({
    ...store,
    entries: store.entries.filter((entry) => entry.contentId !== contentId)
  });
}

// --- Custom Folders ---
const customFoldersKey = (userId: string) => `fishystream:library:custom-folders:${userId}`;

export function getCustomFolders(userId: string = "guest"): string[] {
  const value = readJson(customFoldersKey(userId));
  return Array.isArray(value)
    ? value.filter((folder): folder is string => typeof folder === "string")
    : [];
}

export function setCustomFolders(userId: string = "guest", folders: string[]) {
  writeJson(customFoldersKey(userId), folders);
}
