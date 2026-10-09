export interface IMDbText {
  text?: string | null;
}

export interface IMDbTitleNode {
  id?: string;
  titleText?: IMDbText | null;
  titleType?: { text?: string | null; id?: string | null } | null;
  releaseYear?: { year?: number | null } | null;
  releaseDate?: { year?: number | null } | null;
  primaryImage?: { url?: string | null } | null;
  ratingsSummary?: { aggregateRating?: number | null; voteCount?: number | null } | null;
  plot?: { plotText?: { plainText?: string | null } | null } | null;
  genres?: { genres?: IMDbText[] | null } | null;
  runtime?: { seconds?: number | null } | null;
  certificate?: { rating?: string | null } | null;
  taglines?: { edges?: Array<{ node?: IMDbText | null }> | null } | null;
  spokenLanguages?: { spokenLanguages?: IMDbText[] | null } | null;
  productionStatus?: { currentProductionStage?: IMDbText | null } | null;
  episodes?: {
    seasons?: Array<{ number?: number | null }> | null;
    episodes?: { total?: number | null } | null;
  } | null;
  series?: {
    episodeNumber?: { episodeNumber?: number | null; seasonNumber?: number | null } | null;
  } | null;
}

export interface IMDbPageInfo {
  endCursor?: string | null;
  hasNextPage?: boolean | null;
}

export interface IMDbTitleResponse {
  title?: IMDbTitleNode | null;
}

export interface IMDbEpisodesResponse {
  title?: {
    episodes?: {
      episodes?: {
        edges?: Array<{ node?: IMDbTitleNode | null }> | null;
        pageInfo?: IMDbPageInfo | null;
      } | null;
    } | null;
  } | null;
}

export interface IMDbSearchResponse {
  mainSearch?: {
    edges?: Array<{ node?: { entity?: IMDbTitleNode | null } | null }> | null;
  } | null;
}

export interface IMDbBrowseResponse {
  advancedTitleSearch?: {
    edges?: Array<{ node?: { title?: IMDbTitleNode | null } | null }> | null;
    total?: number | null;
    pageInfo?: IMDbPageInfo | null;
  } | null;
}

export interface IMDbRelatedResponse {
  title?: {
    moreLikeThisTitles?: { edges?: Array<{ node?: IMDbTitleNode | null }> | null } | null;
  } | null;
}

export interface IMDbCreditsResponse {
  title?: {
    principalCredits?: Array<{
      category?: { id?: string | null } | null;
      credits?: Array<{
        name?: {
          id?: string | null;
          nameText?: IMDbText | null;
          primaryImage?: { url?: string | null } | null;
        } | null;
        characters?: Array<{ name?: string | null }> | null;
      }> | null;
    }> | null;
  } | null;
}

export interface IMDbVideosResponse {
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
}
