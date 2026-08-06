export type MediaType = "movie" | "tv";
export interface TitleReference {
  id: `tt${string}`;
  type?: MediaType;
  seasonNumber?: number;
  cursor?: string;
}
export interface Rating {
  value: number;
  voteCount?: number;
}
export interface Title {
  id: `tt${string}`;
  type?: MediaType;
  title: string;
  rating?: Rating;
}
export interface Episode {
  id: `tt${string}`;
  type?: MediaType;
  title: string;
  rating?: Rating;
  seasonNumber?: number;
  episodeNumber?: number;
}
export interface EpisodePage {
  episodes: Episode[];
  nextCursor?: string;
}
export interface MetadataClient {
  getTitle(reference: TitleReference, signal?: AbortSignal): Promise<Title | null>;
  getTitleRating(reference: TitleReference, signal?: AbortSignal): Promise<Rating | null>;
  getEpisodePage(reference: TitleReference, signal?: AbortSignal): Promise<EpisodePage>;
}
export type IMDbId = `tt${string}`;
export type IMDbRating = Rating;
export type IMDbTitle = Title;
export type IMDbEpisode = Episode;
export type IMDbEpisodePage = EpisodePage;
export type IMDbGraphQLResponse<T> = { data?: T; errors?: Array<{ message: string }> };
export type IMDbRequest = (query: string, signal?: AbortSignal) => Promise<unknown>;
export type IMDbClient = MetadataClient;

export type IMDBMediaType = MediaType;

export type IMDBTitleNode = {
  id: string;
  titleText?: { text?: string | null } | null;
  originalTitleText?: { text?: string | null } | null;
  titleType?: { text?: string | null; id?: string | null } | null;
  releaseYear?: { year?: number | null } | null;
  releaseDate?: { year?: number | null; month?: number | null; day?: number | null } | null;
  primaryImage?: { url?: string | null } | null;
  ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null } | null;
  plot?: { plotText?: { plainText?: string | null } | null } | null;
  genres?: { genres?: Array<{ text?: string | null }> | null } | null;
  runtime?: { seconds?: number | null } | null;
  certificate?: { rating?: string | null } | null;
  taglines?: { edges?: Array<{ node?: { text?: string | null } | null }> | null } | null;
  spokenLanguages?: { spokenLanguages?: Array<{ text?: string | null }> | null } | null;
  productionStatus?: { currentProductionStage?: { text?: string | null } | null } | null;
  episodes?: {
    seasons?: Array<{ number?: number | null }> | null;
    episodes?: { total?: number | null } | null;
  } | null;
  series?: {
    episodeNumber?: { episodeNumber?: number | null; seasonNumber?: number | null } | null;
  } | null;
};

export type IMDBSearchEdge = { node?: { entity?: IMDBTitleNode | null } | null };
export type IMDBSearchResponse = { mainSearch?: { edges?: IMDBSearchEdge[] | null } | null };

export type IMDBBrowseEdge = { node?: { title?: IMDBTitleNode | null } | null };
export type IMDBBrowseResponse = {
  advancedTitleSearch?: { edges?: IMDBBrowseEdge[] | null; total?: number | null } | null;
};

export type IMDBRelatedResponse = {
  title?: {
    moreLikeThisTitles?: { edges?: Array<{ node?: IMDBTitleNode | null }> | null } | null;
  } | null;
};

export type IMDBDetailResponse = { title?: IMDBTitleNode | null };

export type IMDBCreditsResponse = {
  title?: {
    principalCredits?: Array<{
      category?: { id?: string | null } | null;
      credits?: Array<{
        name?: {
          id?: string | null;
          nameText?: { text?: string | null } | null;
          primaryImage?: { url?: string | null } | null;
        } | null;
        characters?: Array<{ name?: string | null }> | null;
      }> | null;
    }> | null;
  } | null;
};

export type IMDBVideosResponse = {
  title?: {
    videos?: {
      edges?: Array<{
        node?: {
          id?: string | null;
          name?: { value?: string | null } | null;
          contentType?: { displayName?: { value?: string | null } | null } | null;
          isMature?: boolean | null;
        } | null;
      }> | null;
    } | null;
  } | null;
};

export type IMDBSeasonEpisodesResponse = {
  title?: {
    episodes?: {
      episodes?: {
        edges?: Array<{ node?: IMDBTitleNode | null }> | null;
        pageInfo?: { endCursor?: string | null; hasNextPage?: boolean | null } | null;
      } | null;
    } | null;
  } | null;
};

export type IMDBContentCard = {
  imdbId: string;
  title: string;
  type: MediaType;
  year: number;
  posterUrl: string;
  voteAverage?: number;
  genre: string[];
  isNew: boolean;
};

export type IMDBItem = {
  imdbId: string;
  title: string;
  posterUrl: string;
  year: number;
  genre: string[];
  rating: string;
  voteAverage?: number;
  type: MediaType;
};

export type IMDBCreditResult = {
  cast: Array<{ id: string; name: string; character: string; profileUrl?: string; order: number }>;
  directors: string[];
};

export type IMDBVideoResult = { key: string; name: string; type: string; official: boolean };

export type IMDBDetailsResult = {
  description: string;
  backdropUrl: string;
  rating: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  hasSpecials?: boolean;
  tagline?: string;
  originalLanguage?: string;
};

export type IMDBFullDetail = {
  imdbId: string;
  type: MediaType;
  title: string;
  description: string;
  year: number;
  rating: string;
  voteAverage?: number;
  posterUrl: string;
  backdropUrl: string;
  logoUrl?: string;
  trailerKey?: string;
  duration?: string;
  seasons?: number;
  hasSpecials?: boolean;
  totalEpisodes?: number;
  genre: string[];
  originalLanguage?: string;
  tagline?: string;
  status?: string;
  trending: boolean;
  isNew: boolean;
};

export type IMDBDiscoverResult = {
  items: IMDBContentCard[];
  totalPages: number;
  totalResults: number;
};
