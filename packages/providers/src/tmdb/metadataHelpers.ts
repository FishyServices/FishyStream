import { GENRE_MAP } from "./constants.js";
import type { TMDBVideo } from "./types.js";

export function getGenres(item: {
  genres?: Array<{ id: number; name: string }>;
  genre_ids?: number[];
}): string[] {
  if (item.genres?.length) return item.genres.map((g) => g.name);
  return (item.genre_ids ?? []).map((id) => GENRE_MAP[id]).filter(Boolean) as string[];
}

export function getYear(date?: string): number {
  if (!date) return new Date().getFullYear();
  const year = parseInt(date.split("-")[0] ?? String(new Date().getFullYear()));
  return Number.isFinite(year) ? year : new Date().getFullYear();
}

export function getRating(voteAverage: number, certificationOrRating?: string | null): string {
  if (certificationOrRating) {
    const r = certificationOrRating.trim().toUpperCase();
    const known = ["G", "PG", "PG-13", "R", "NC-17", "TV-Y", "TV-G", "TV-PG", "TV-14", "TV-MA"];
    if (known.includes(r)) return r;
    if (r === "U" || r === "U/A") return "PG";
    if (r === "A") return "R";
    if (r === "18" || r === "18+") return "R";
    if (r === "15" || r === "16+") return "PG-13";
    if (r === "12" || r === "12A" || r === "13+") return "PG-13";
  }
  if (voteAverage >= 7.5) return "PG-13";
  if (voteAverage >= 5) return "PG";
  return "G";
}

export function getTrailerKey(videos: TMDBVideo[] | undefined): string | undefined {
  if (!videos?.length) return undefined;
  const priority = ["Official Trailer", "Trailer", "Teaser", "Clip", "Featurette"];
  for (const type of priority) {
    const v = videos.find((v) => v.site === "YouTube" && v.type === type && v.official);
    if (v) return v.key;
  }
  return videos.find((v) => v.site === "YouTube" && v.type === "Trailer")?.key;
}

export function isAnimeLikeContent(args: {
  type: "movie" | "tv";
  genres: string[];
  originalLanguage?: string;
}): boolean {
  if (args.type !== "tv") return false;
  return (
    args.originalLanguage?.toLowerCase() === "ja" &&
    args.genres.some((g) => g.toLowerCase() === "animation")
  );
}

export function formatRuntime(minutes?: number): string | undefined {
  if (!minutes || minutes <= 0) return undefined;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  return items
    .map((item, index) => {
      const score = Math.sin((index + 1) * 999 + seed * 9973) * 10000;
      return { item, score: score - Math.floor(score) };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
}

export async function mapInBatches<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((item, bi) => fn(item, i + bi)));
    out.push(...results);
  }
  return out;
}
