import type { ContentId, WatchlistGridItem } from "@content/contentMetadata";
import {
  getWatchlistIds,
  getWatchlistSnapshots,
  setWatchlistIds,
  setWatchlistSnapshots
} from "@/shared/storage/localStorageStore";

export interface WatchlistPersistence {
  list(userId: string): Promise<WatchlistGridItem[]>;
  toggle(userId: string, contentId: ContentId): Promise<void>;
  setFolder(userId: string, contentId: ContentId, folder?: string): Promise<void>;
}

export interface ProgressPersistence {
  load(userId: string, contentId: ContentId): Promise<unknown>;
  save(userId: string, contentId: ContentId, value: unknown): Promise<void>;
}

export const guestWatchlistPersistence: Pick<WatchlistPersistence, "setFolder"> = {
  async setFolder(_userId, contentId, folder) {
    const snapshots = getWatchlistSnapshots();
    const snapshot = snapshots[contentId];
    if (!snapshot) return;
    snapshots[contentId] = { ...snapshot, watchlistFolder: folder };
    setWatchlistSnapshots(snapshots);
  }
};

export function listGuestWatchlist(): WatchlistGridItem[] {
  const snapshots = getWatchlistSnapshots();
  return getWatchlistIds()
    .map<WatchlistGridItem | null>((id) => {
      const snapshot = snapshots[id];
      if (!snapshot) return null;
      return {
        _id: id as ContentId,
        title: snapshot.title,
        type: snapshot.type,
        posterUrl: snapshot.posterUrl,
        tmdbId: snapshot.tmdbId,
        watchlistFolder: snapshot.watchlistFolder,
        genre: snapshot.genre,
        year: snapshot.year,
        voteAverage: snapshot.voteAverage
      };
    })
    .filter((item): item is WatchlistGridItem => item !== null)
    .reverse();
}
