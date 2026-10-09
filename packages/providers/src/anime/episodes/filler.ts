import { memoizeAsync } from "../../shared/async.js";
import { resolveAniListEpisodeAddress } from "../anilist/resolver.js";
import { createJikanClient } from "../jikan/client.js";

const DEFAULT_WINDOW_SIZE = 20;
const JIKAN_EPISODES_PER_PAGE = 100;

export interface FillerEpisode {
  episodeNumber: number;
  isFiller: boolean;
}

export interface FillerLookup {
  title: string;
  season: number;
  year?: number;
  centerEpisode?: number;
  windowSize?: number;
  signal?: AbortSignal;
}

interface FillerWindow {
  start: number;
  end: number;
  page: number;
}

const jikan = createJikanClient();

const loadFillerWindow = memoizeAsync(
  async (lookup: FillerLookup, window: FillerWindow): Promise<FillerEpisode[] | null> => {
    const address = await resolveAniListEpisodeAddress({
      title: lookup.title,
      season: lookup.season,
      year: lookup.year,
      episode: 1
    });
    if (!address?.malId) return null;

    const { data } = await jikan.getEpisodes(address.malId, {
      page: window.page,
      signal: lookup.signal
    });
    return data
      .map((episode) => ({ episodeNumber: episode.mal_id, isFiller: episode.filler }))
      .filter(({ episodeNumber }) => episodeNumber >= window.start && episodeNumber <= window.end);
  },
  (lookup, window) =>
    `${lookup.title}:${lookup.season}:${lookup.year ?? ""}:${window.start}:${window.end}`
);

export function fetchAnimeFillerEpisodes(lookup: FillerLookup): Promise<FillerEpisode[] | null> {
  const windowSize = Math.max(1, lookup.windowSize ?? DEFAULT_WINDOW_SIZE);
  const centerEpisode = Math.max(1, Math.floor(lookup.centerEpisode ?? 1));
  const start = Math.floor((centerEpisode - 1) / windowSize) * windowSize + 1;
  return loadFillerWindow(lookup, {
    start,
    end: start + windowSize - 1,
    page: Math.ceil(centerEpisode / JIKAN_EPISODES_PER_PAGE)
  });
}
