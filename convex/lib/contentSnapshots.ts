import type { Doc } from "../_generated/dataModel";

type SnapshotCarrier = {
  contentType?: "movie" | "tv";
  title?: string;
  genre?: string[];
  year?: number;
  voteAverage?: number;
  posterUrl?: string;
  tmdbId?: string;
  new?: boolean;
};

export function buildContentSnapshot(content: Doc<"content">) {
  return {
    contentType: content.type,
    title: content.title,
    genre: content.genre.slice(0, 3),
    year: content.year,
    voteAverage: content.voteAverage,
    posterUrl: content.posterUrl,
    tmdbId: content.tmdbId,
    new: content.new,
    snapshotUpdatedAt: Date.now()
  };
}

export function hasContentSnapshot(value: SnapshotCarrier) {
  return !!(
    value.contentType &&
    value.title &&
    value.genre &&
    value.posterUrl &&
    value.year !== undefined &&
    value.new !== undefined
  );
}
