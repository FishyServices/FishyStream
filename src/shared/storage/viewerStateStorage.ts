import { parseContentId, type ContentId, type ContentType } from "@content/contentMetadata";
import { getLocalStorageItem, setLocalStorageItem } from "./browserStorage";

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
