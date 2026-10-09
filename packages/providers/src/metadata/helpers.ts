import type { MediaType } from "../shared/media.js";

export const PLACEHOLDER_POSTER_URL = "https://placehold.co/500x750/1a1a2e/666?text=No+Poster";

export interface CollectOptions {
  excludedIds?: ReadonlySet<string>;
  typeFilter?: "all" | MediaType;
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function deriveAgeRating(voteAverage = 0): string {
  if (voteAverage >= 7.5) return "PG-13";
  return voteAverage >= 5 ? "PG" : "G";
}

export function formatDuration(totalMinutes?: number | null): string | undefined {
  if (!totalMinutes) return undefined;
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

export function collectUniqueCards<Card extends { type: MediaType }>(
  cards: Iterable<Card>,
  idOf: (card: Card) => string,
  options: CollectOptions = {}
): Card[] {
  const { excludedIds, typeFilter = "all" } = options;
  const seen = new Set<string>();
  const result: Card[] = [];
  for (const card of cards) {
    const key = `${card.type}:${idOf(card)}`;
    if (seen.has(key) || excludedIds?.has(key)) continue;
    if (typeFilter !== "all" && card.type !== typeFilter) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}
