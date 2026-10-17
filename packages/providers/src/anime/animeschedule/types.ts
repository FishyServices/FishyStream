export type AnimeScheduleAirType = "raw" | "sub" | "dub";

export interface AnimeScheduleTitle {
  id: string;
  title: string;
  route: string;
  names: { english?: string; romaji?: string; native?: string; synonyms?: string[] };
  format?: string;
  episodes?: number;
  websites?: { aniList?: string; mal?: string };
  mediaTypes?: Array<{ name?: string; route?: string }>;
}

export interface AnimeScheduleEpisode {
  route: string;
  title: string;
  english?: string;
  romaji?: string;
  episodeDate: string;
  episodeNumber: number;
  airType: AnimeScheduleAirType;
  airingStatus?: string;
  platform?: string;
  estimated?: boolean;
}

export type AnimeScheduleRequest = (
  path: string,
  params?: Record<string, string | number | undefined>,
  signal?: AbortSignal
) => Promise<unknown>;
