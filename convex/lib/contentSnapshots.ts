type SnapshotSource = {
  type: "movie" | "tv";
  title: string;
  posterUrl: string;
  tmdbId?: string;
};

export function buildContentSnapshot(content: SnapshotSource) {
  return {
    contentType: content.type,
    title: content.title,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId
  };
}
