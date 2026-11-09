import type { AniListWatchOrderItem } from "@fishy/providers/anime/anilist";
import { getLocalStorageItem, setLocalStorageItem } from "./browserStorage";

const STORAGE_KEY = "fishystream:catalog:anime-watch-orders:v2";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CacheEntry = { cachedAt: number; items: AniListWatchOrderItem[] };
type CacheRecord = Record<string, CacheEntry>;

function cacheKey(title: string, year?: number): string {
  return `${title.trim().toLocaleLowerCase()}|${year ?? ""}`;
}

function readCache(): CacheRecord {
  const raw = getLocalStorageItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    return typeof value === "object" && value !== null ? (value as CacheRecord) : {};
  } catch {
    return {};
  }
}

export function getCachedAnimeWatchOrder(
  title: string,
  year?: number,
  now = Date.now()
): AniListWatchOrderItem[] | null {
  const entry = readCache()[cacheKey(title, year)];
  if (
    !entry ||
    typeof entry.cachedAt !== "number" ||
    !Array.isArray(entry.items) ||
    now - entry.cachedAt > CACHE_TTL_MS
  ) {
    return null;
  }
  return entry.items;
}

export function setCachedAnimeWatchOrder(
  title: string,
  year: number | undefined,
  items: AniListWatchOrderItem[],
  now = Date.now()
): void {
  const cache = readCache();
  const current = Object.fromEntries(
    Object.entries(cache).filter(
      ([, entry]) =>
        typeof entry?.cachedAt === "number" &&
        Array.isArray(entry.items) &&
        now - entry.cachedAt <= CACHE_TTL_MS
    )
  );
  current[cacheKey(title, year)] = { cachedAt: now, items };
  try {
    setLocalStorageItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
}
