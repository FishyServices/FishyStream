import type { ContentId, WatchlistGridItem } from "@content/contentMetadata";
import {
  getWatchlistIds,
  getWatchlistSnapshots,
  setWatchlistIds,
  setWatchlistSnapshots
} from "@/shared/storage/localStorageStore";

export const guestWatchlistPersistence = {
  setFolder(contentId: ContentId, folder?: string): void {
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
