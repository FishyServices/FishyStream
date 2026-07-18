import { type ContentType } from "@content/contentMetadata";

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

// --- Watchlist ---
const LS_WATCHLIST_IDS_KEY = "watchlist_ids";
const LS_WATCHLIST_TMDB_KEY = "watchlist_tmdb_map";
const LS_WATCHLIST_SNAPSHOTS_KEY = "watchlist_snapshots_v1";

export function getWatchlistIds(): string[] {
  try {
    const raw = localStorage.getItem(LS_WATCHLIST_IDS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setWatchlistIds(ids: string[]) {
  try {
    localStorage.setItem(LS_WATCHLIST_IDS_KEY, JSON.stringify(ids));
  } catch {}
}

export function getWatchlistTmdbMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_WATCHLIST_TMDB_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
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
    const raw = localStorage.getItem(LS_WATCHLIST_SNAPSHOTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setWatchlistSnapshots(snapshots: Record<string, LocalContentSnapshot>) {
  try {
    localStorage.setItem(LS_WATCHLIST_SNAPSHOTS_KEY, JSON.stringify(snapshots));
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
    const raw = localStorage.getItem(LS_WATCH_PROGRESS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProgressStore;
      if (parsed?.version === 3 && Array.isArray(parsed.entries)) {
        return parsed;
      }
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
