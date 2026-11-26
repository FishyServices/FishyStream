import type { ContentId, BookmarkGridItem } from "@content/contentMetadata";
import {
  getBookmarkIds,
  getBookmarkSnapshots,
  setBookmarkIds,
  setBookmarkSnapshots
} from "@/shared/storage/viewerStateStorage";

export const guestBookmarkPersistence = {
  setFolder(contentId: ContentId, folder?: string): void {
    const snapshots = getBookmarkSnapshots();
    const snapshot = snapshots[contentId];
    if (!snapshot) return;
    if (snapshot.bookmarkFolder === folder) return;
    snapshots[contentId] = { ...snapshot, bookmarkFolder: folder };
    setBookmarkSnapshots(snapshots);
    const ids = getBookmarkIds();
    setBookmarkIds([...ids.filter((id) => id !== contentId), contentId]);
  },
  removeMany(contentIds: readonly ContentId[]): void {
    const removed = new Set(contentIds);
    const snapshots = getBookmarkSnapshots();
    for (const contentId of removed) delete snapshots[contentId];
    setBookmarkSnapshots(snapshots);
    setBookmarkIds(getBookmarkIds().filter((id) => !removed.has(id)));
  },
  setFolderMany(contentIds: readonly ContentId[], folder?: string): void {
    const requested = new Set(contentIds);
    const snapshots = getBookmarkSnapshots();
    const moved: ContentId[] = [];
    for (const contentId of requested) {
      const snapshot = snapshots[contentId];
      if (snapshot && snapshot.bookmarkFolder !== folder) {
        snapshots[contentId] = { ...snapshot, bookmarkFolder: folder };
        moved.push(contentId);
      }
    }
    setBookmarkSnapshots(snapshots);
    if (moved.length > 0) {
      const ids = getBookmarkIds();
      setBookmarkIds([...ids.filter((id) => !requested.has(id)), ...moved]);
    }
  }
};

export function listGuestBookmark(): BookmarkGridItem[] {
  const snapshots = getBookmarkSnapshots();
  return getBookmarkIds()
    .map<BookmarkGridItem | null>((id) => {
      const snapshot = snapshots[id];
      if (!snapshot) return null;
      return {
        _id: id,
        title: snapshot.title,
        type: snapshot.type,
        posterUrl: snapshot.posterUrl,
        tmdbId: snapshot.tmdbId,
        bookmarkFolder: snapshot.bookmarkFolder,
        genre: snapshot.genre,
        year: snapshot.year,
        voteAverage: snapshot.voteAverage
      };
    })
    .filter((item): item is BookmarkGridItem => item !== null)
    .reverse();
}
