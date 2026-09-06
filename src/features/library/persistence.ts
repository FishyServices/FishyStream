import type { ContentId, WatchlistGridItem } from "@content/contentMetadata";
import {
  getWatchlistIds,
  getWatchlistSnapshots,
  setWatchlistIds,
  setWatchlistSnapshots,
  setWatchlistTmdbMap
} from "@/shared/storage/localStorageStore";

export const guestWatchlistPersistence = {
  setFolder(contentId: ContentId, folder?: string): void {
    const snapshots = getWatchlistSnapshots();
    const snapshot = snapshots[contentId];
    if (!snapshot) return;
    snapshots[contentId] = { ...snapshot, watchlistFolder: folder };
    setWatchlistSnapshots(snapshots);
  },
  removeMany(contentIds: readonly ContentId[]): void {
    const removed = new Set(contentIds);
    const snapshots = getWatchlistSnapshots();
    for (const contentId of removed) delete snapshots[contentId];
    setWatchlistSnapshots(snapshots);
    setWatchlistIds(getWatchlistIds().filter((id) => !removed.has(id)));
    const tmdbMap = Object.fromEntries(
      Object.entries(snapshots).map(([contentId, snapshot]) => [contentId, snapshot.tmdbId])
    );
    setWatchlistTmdbMap(tmdbMap);
  },
  setFolderMany(contentIds: readonly ContentId[], folder?: string): void {
    const requested = new Set(contentIds);
    const snapshots = getWatchlistSnapshots();
    for (const contentId of requested) {
      const snapshot = snapshots[contentId];
      if (snapshot) snapshots[contentId] = { ...snapshot, watchlistFolder: folder };
    }
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
        _id: id,
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
