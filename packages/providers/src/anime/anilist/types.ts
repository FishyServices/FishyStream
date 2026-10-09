export interface AniListTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}

export interface AniListStartDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface AniListMedia {
  id: number;
  idMal?: number | null;
  type?: string | null;
  format?: string | null;
  episodes?: number | null;
  startDate?: AniListStartDate | null;
  title?: AniListTitle | null;
  synonyms?: string[] | null;
  relations?: {
    edges?: Array<{ relationType?: string | null; node?: AniListMedia | null }> | null;
  } | null;
}

export interface AniListEpisodeAddress {
  anilistId: string;
  malId?: string;
  episode: number;
}

export interface AniListSeasonQuery {
  title?: string;
  season: number;
  seasonTitle?: string;
  year?: number;
}

export interface AniListEpisodeQuery extends AniListSeasonQuery {
  anilistId?: string | null;
  episode: number;
}
