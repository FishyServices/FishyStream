import type {
  CardBase,
  CreditResult,
  DiscoverResult,
  DiscoverSort,
  FullDetailBase,
  ItemBase,
  SeasonDetail,
  TitleDetails,
  VideoResult
} from "../types.js";
import type { TMDBListItem, TMDBListResponse } from "./schema.js";

export type { TMDBListItem, TMDBListResponse };

export type TMDBId = string | number;
export type TMDBParams = Record<string, string | number | undefined>;
export type TMDBRequest = (
  path: string,
  params: TMDBParams,
  signal?: AbortSignal
) => Promise<unknown>;

export interface TMDBItem extends ItemBase {
  tmdbId: number;
}

export interface TMDBContentCard extends CardBase {
  tmdbId: string;
  releaseDate?: string;
  popularity?: number;
}

export interface TMDBDetailsResult extends TitleDetails {
  releaseDate?: string;
}

export interface TMDBFullDetail extends FullDetailBase {
  tmdbId: string;
  imdbId?: string;
  releaseDate?: string;
}

export interface TMDBCanonicalSeason {
  seasonNumber: number;
  name: string;
  overview?: string;
  airDate?: string;
  episodeCount: number;
  episodeOffset: number;
  year?: number;
  episodes: SeasonDetail["episodes"];
}

export interface TMDBSearchResult {
  items: TMDBItem[];
  totalPages: number;
}

export interface TMDBSearchOptions {
  page?: number;
  signal?: AbortSignal;
}

export interface TMDBDiscoverOptions {
  page?: number;
  sortBy?: DiscoverSort;
  genreId?: number | string;
  minVoteCount?: number;
  signal?: AbortSignal;
}

export type TMDBCreditResult = CreditResult<number>;
export type TMDBVideoResult = VideoResult;
export type TMDBDiscoverResult = DiscoverResult<TMDBContentCard>;
export type TMDBSeasonDetail = SeasonDetail;
