import { resolveAniListEpisodeAddress } from "./anilistResolver.js";

export type FillerEpisode = {
  episodeNumber: number;
  isFiller: boolean;
};

const fillerCache = new Map<string, Promise<FillerEpisode[] | null>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJikanEpisodes(value: unknown): FillerEpisode[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((episode): FillerEpisode[] => {
    if (!isRecord(episode)) return [];
    const episodeNumber = episode.mal_id;
    if (typeof episodeNumber !== "number" || !Number.isInteger(episodeNumber)) return [];
    return [{ episodeNumber, isFiller: episode.filler === true }];
  });
}

async function fetchJikanEpisodePage(malId: string, page: number, signal?: AbortSignal) {
  const response = await fetch(
    `https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/episodes?page=${page}`,
    { signal, headers: { Accept: "application/json" } }
  );
  if (!response.ok) return null;

  const payload: unknown = await response.json();
  return isRecord(payload) ? parseJikanEpisodes(payload.data) : null;
}

export async function fetchAnimeFillerEpisodes(args: {
  title: string;
  season: number;
  year?: number;
  centerEpisode?: number;
  windowSize?: number;
  signal?: AbortSignal;
}): Promise<FillerEpisode[] | null> {
  const windowSize = Math.max(1, args.windowSize ?? 20);
  const centerEpisode = Math.max(1, Math.floor(args.centerEpisode ?? 1));
  const windowStart = Math.floor((centerEpisode - 1) / windowSize) * windowSize + 1;
  const windowEnd = windowStart + windowSize - 1;
  const cacheKey = `${args.title}:${args.season}:${args.year ?? ""}:${windowStart}:${windowEnd}`;
  const cached = fillerCache.get(cacheKey);
  if (cached) return cached;

  const pending = (async () => {
    const address = await resolveAniListEpisodeAddress({
      title: args.title,
      season: args.season,
      year: args.year,
      episode: 1
    });
    if (!address?.malId) return null;
    const page = Math.ceil(centerEpisode / 100);
    const episodes = await fetchJikanEpisodePage(address.malId, page, args.signal);
    return (
      episodes?.filter(
        (episode) => episode.episodeNumber >= windowStart && episode.episodeNumber <= windowEnd
      ) ?? null
    );
  })();

  fillerCache.set(cacheKey, pending);
  try {
    return await pending;
  } catch (error) {
    fillerCache.delete(cacheKey);
    throw error;
  }
}
