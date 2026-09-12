import { parseContentId, type ContentId, type ContentType } from "@content/contentMetadata";

export type LocalContentSnapshot = {
  title: string;
  type: ContentType;
  posterUrl: string;
  tmdbId: string;
  genre?: string[];
  year?: number;
  voteAverage?: number;
  watchlistFolder?: string;
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
    (value.genre === undefined || Array.isArray(value.genre)) &&
    (value.year === undefined || typeof value.year === "number") &&
    (value.voteAverage === undefined || typeof value.voteAverage === "number") &&
    (value.watchlistFolder === undefined || typeof value.watchlistFolder === "string")
  );
}

function isProgressState(value: unknown): value is ProgressState {
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
    typeof value.clientUpdatedAt === "number"
  );
}

function isStoredProgress(value: unknown): value is StoredProgress {
  if (!isRecord(value) || !isProgressState(value)) return false;
  return (
    typeof value.contentId === "string" &&
    parseContentId(value.contentId) !== null &&
    typeof value.dirty === "boolean" &&
    (value.syncedClientUpdatedAt === undefined || typeof value.syncedClientUpdatedAt === "number")
  );
}

function readJson(key: string): unknown {
  const raw = localStorage.getItem(key);
  return raw === null ? undefined : JSON.parse(raw);
}

// --- Watchlist ---
const LS_WATCHLIST_IDS_KEY = "watchlist_ids";
const LS_WATCHLIST_TMDB_KEY = "watchlist_tmdb_map";
const LS_WATCHLIST_SNAPSHOTS_KEY = "watchlist_snapshots_v1";
const LS_WATCHLIST_CACHE_PREFIX = "watchlist_cache_v1:";

export type WatchlistCache = {
  ids: ContentId[];
  snapshots: Record<string, LocalContentSnapshot>;
};

export function getWatchlistIds(): ContentId[] {
  try {
    const value = readJson(LS_WATCHLIST_IDS_KEY);
    return Array.isArray(value)
      ? value.filter((id): id is ContentId => typeof id === "string" && parseContentId(id) !== null)
      : [];
  } catch {
    return [];
  }
}

export function setWatchlistIds(ids: readonly string[]) {
  try {
    localStorage.setItem(LS_WATCHLIST_IDS_KEY, JSON.stringify(ids));
  } catch {}
}

export function getWatchlistTmdbMap(): Record<string, string> {
  try {
    const value = readJson(LS_WATCHLIST_TMDB_KEY);
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

export function setWatchlistTmdbMap(map: Map<string, string> | Record<string, string>) {
  try {
    const obj: Record<string, string> = {};
    if (map instanceof Map) {
      map.forEach((v, k) => {
        obj[k] = v;
      });
    } else {
      Object.assign(obj, map);
    }
    localStorage.setItem(LS_WATCHLIST_TMDB_KEY, JSON.stringify(obj));
  } catch {}
}

export function getWatchlistSnapshots(): Record<string, LocalContentSnapshot> {
  try {
    const value = readJson(LS_WATCHLIST_SNAPSHOTS_KEY);
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, LocalContentSnapshot] =>
        isLocalContentSnapshot(entry[1])
      )
    );
  } catch {
    return {};
  }
}

export function setWatchlistSnapshots(snapshots: Record<string, LocalContentSnapshot>) {
  try {
    localStorage.setItem(LS_WATCHLIST_SNAPSHOTS_KEY, JSON.stringify(snapshots));
  } catch {}
}

function getWatchlistCacheKey(userId: string) {
  return `${LS_WATCHLIST_CACHE_PREFIX}${userId}`;
}

export function getWatchlistCache(userId: string): WatchlistCache {
  try {
    const value = readJson(getWatchlistCacheKey(userId));
    if (!isRecord(value) || !Array.isArray(value.ids) || !isRecord(value.snapshots)) {
      return { ids: [], snapshots: {} };
    }
    return {
      ids: value.ids.filter(
        (id): id is ContentId => typeof id === "string" && parseContentId(id) !== null
      ),
      snapshots: Object.fromEntries(
        Object.entries(value.snapshots).filter((entry): entry is [string, LocalContentSnapshot] =>
          isLocalContentSnapshot(entry[1])
        )
      )
    };
  } catch {
    return { ids: [], snapshots: {} };
  }
}

export function setWatchlistCache(userId: string, cache: WatchlistCache) {
  try {
    localStorage.setItem(getWatchlistCacheKey(userId), JSON.stringify(cache));
  } catch {}
}

// --- Watch Progress ---
const LS_WATCH_PROGRESS_KEY = "watch_progress_v3";

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
  try {
    const value = readJson(LS_WATCH_PROGRESS_KEY);
    if (
      isRecord(value) &&
      value.version === 3 &&
      Array.isArray(value.entries) &&
      value.entries.every(isStoredProgress)
    ) {
      return { version: 3, entries: value.entries };
    }
  } catch {}
  return null;
}

export function setWatchProgressStore(store: ProgressStore) {
  try {
    localStorage.setItem(LS_WATCH_PROGRESS_KEY, JSON.stringify(store));
  } catch {}
}

export function removeWatchProgressEntry(contentId: string) {
  try {
    const store = getWatchProgressStore();
    if (store && Array.isArray(store.entries)) {
      store.entries = store.entries.filter((e) => e.contentId !== contentId);
      setWatchProgressStore(store);
    }
  } catch {}
}

// --- Custom Folders ---
export function getCustomFoldersKey(userId: string = "guest") {
  return `watchlist_custom_folders_${userId}`;
}

export function getCustomFolders(userId: string = "guest"): string[] {
  try {
    const raw = localStorage.getItem(getCustomFoldersKey(userId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setCustomFolders(userId: string = "guest", folders: string[]) {
  try {
    localStorage.setItem(getCustomFoldersKey(userId), JSON.stringify(folders));
  } catch {}
}
