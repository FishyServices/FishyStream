export interface TenraiAnime {
  mal_id: number;
  url: string;
  title: string;
  images?: { jpg?: { image_url: string | null; large_image_url: string | null } };
  title_english: string | null;
  title_japanese: string | null;
  type: string | null;
  episodes: number | null;
  status: string | null;
  airing: boolean;
  aired?: { from: string | null; to: string | null };
  duration: string | null;
  rating: string | null;
  score: number | null;
  scored_by: number | null;
  synopsis: string | null;
  year: number | null;
  genres?: Array<{ name: string }>;
  season: string | null;
}

export interface TenraiEpisode {
  mal_id: number;
  title: string;
  title_japanese: string | null;
  title_romaji: string | null;
  aired: string | null;
  score: number | null;
  filler: boolean;
  recap: boolean;
}

export interface TenraiPage<T> {
  data: T[];
  pagination: { last_visible_page: number; has_next_page: boolean };
}

export type TenraiParams = Record<string, string | number | boolean | undefined>;
export type TenraiRequest = (
  path: string,
  params?: TenraiParams,
  signal?: AbortSignal
) => Promise<unknown>;
