import type { TMDBMediaType } from "@fishy/providers/tmdb";

// rights-holder takedown policy.
// not getting DMCA agian
const BLOCKED_TMDB_CONTENT = new Set(["movie:969681"]);
const BLOCKED_IMDB_IDS = new Set(["tt22084616"]);

export function isBlockedContent(input: {
  tmdbId?: string | number;
  type?: TMDBMediaType;
  imdbId?: string;
}): boolean {
  return (
    (input.type !== undefined &&
      input.tmdbId !== undefined &&
      BLOCKED_TMDB_CONTENT.has(`${input.type}:${String(input.tmdbId)}`)) ||
    (input.imdbId !== undefined && BLOCKED_IMDB_IDS.has(input.imdbId))
  );
}
