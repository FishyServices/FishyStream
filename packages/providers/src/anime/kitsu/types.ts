export interface KitsuResource<TAttributes = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: TAttributes;
  relationships?: Record<string, unknown>;
}

export interface KitsuAnimeAttributes {
  slug: string;
  synopsis: string | null;
  description: string | null;
  titles: Record<string, string | null>;
  canonicalTitle: string;
  abbreviatedTitles: string[];
  averageRating: string | null;
  userCount: number | null;
  favoritesCount: number | null;
  startDate: string | null;
  endDate: string | null;
  season: string | null;
  seasonYear: number | null;
  popularityRank: number | null;
  ratingRank: number | null;
  ageRating: string | null;
  ageRatingGuide: string | null;
  subtype: string | null;
  status: string | null;
  episodeCount: number | null;
  episodeLength: number | null;
  youtubeVideoId: string | null;
  showType: string | null;
  nsfw: boolean;
  posterImage: KitsuImage | null;
  coverImage: KitsuImage | null;
}

export interface KitsuEpisodeAttributes {
  synopsis: string | null;
  description: string | null;
  canonicalTitle: string;
  seasonNumber: number | null;
  number: number | null;
  relativeNumber: number | null;
  airdate: string | null;
  length: number | null;
  thumbnail: KitsuImage | null;
}

export interface KitsuImage {
  tiny?: string | null;
  small?: string | null;
  medium?: string | null;
  large?: string | null;
  original?: string | null;
  meta?: Record<string, unknown>;
}

export interface KitsuPage<T> {
  data: T[];
  links?: { first?: string; next?: string | null; last?: string };
  meta?: { count?: number };
}

export type KitsuAnime = KitsuResource<KitsuAnimeAttributes>;
export type KitsuEpisode = KitsuResource<KitsuEpisodeAttributes>;
export type KitsuRequest = (
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  signal?: AbortSignal
) => Promise<unknown>;
