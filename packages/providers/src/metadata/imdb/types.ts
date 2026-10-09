import type {
  CardBase,
  CreditResult,
  DiscoverResult,
  DiscoverSort,
  FullDetailBase,
  ItemBase,
  MetadataClient,
  SeasonDetail,
  TitleDetails,
  VideoResult
} from "../types.js";
import type { MediaType } from "../../shared/media.js";

export type IMDbId = `tt${string}`;
export type IMDbGraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };
export type IMDbRequest = (query: string, signal?: AbortSignal) => Promise<unknown>;

export interface IMDbItem extends ItemBase {
  imdbId: string;
}

export interface IMDbContentCard extends CardBase {
  imdbId: string;
}

export interface IMDbFullDetail extends FullDetailBase {
  imdbId: string;
}

export type IMDbDetailsResult = TitleDetails;
export type IMDbCreditResult = CreditResult<string>;
export type IMDbVideoResult = VideoResult;
export type IMDbDiscoverResult = DiscoverResult<IMDbContentCard>;
export type IMDbSeasonDetail = SeasonDetail;

export interface IMDbDiscoverOptions {
  page?: number;
  sortBy?: DiscoverSort;
  genres?: readonly string[];
  signal?: AbortSignal;
}

export interface IMDbClient extends MetadataClient {
  search(query: string, type: MediaType, signal?: AbortSignal): Promise<IMDbItem[]>;
  searchAll(
    query: string,
    signal?: AbortSignal
  ): Promise<{ movies: IMDbItem[]; shows: IMDbItem[] }>;
  discover(type: MediaType, options?: IMDbDiscoverOptions): Promise<IMDbDiscoverResult>;
  fullDetail(id: string, type: MediaType, signal?: AbortSignal): Promise<IMDbFullDetail | null>;
  cardDetail(id: string, type: MediaType, signal?: AbortSignal): Promise<IMDbContentCard | null>;
  details(id: string, type: MediaType, signal?: AbortSignal): Promise<IMDbDetailsResult | null>;
  related(id: string, type: MediaType, limit?: number, signal?: AbortSignal): Promise<IMDbItem[]>;
  credits(id: string, signal?: AbortSignal): Promise<IMDbCreditResult | null>;
  videos(id: string, signal?: AbortSignal): Promise<IMDbVideoResult[]>;
  seasonEpisodes(
    id: string,
    seasonNumber: number,
    signal?: AbortSignal
  ): Promise<IMDbSeasonDetail | null>;
}
