import type { MediaType } from "../../shared/media.js";

export const IMDB_PAGE_SIZE = 20;
export const IMDB_EPISODE_PAGE_SIZE = 250;

const RATING_FIELDS = "ratingsSummary { aggregateRating voteCount }";
const TITLE_FIELDS = `id titleText { text } ${RATING_FIELDS}`;
const CARD_FIELDS = `id titleText { text } titleType { text } releaseYear { year } primaryImage { url } ${RATING_FIELDS} genres { genres { text } }`;
const DETAIL_FIELDS = `${CARD_FIELDS} plot { plotText { plainText } } runtime { seconds } certificate { rating } taglines(first: 1) { edges { node { text } } } spokenLanguages { spokenLanguages { text } } productionStatus { currentProductionStage { text } } episodes { seasons { number } episodes(first: 1) { total } }`;
const SEASON_EPISODE_FIELDS = `id titleText { text } plot { plotText { plainText } } primaryImage { url } runtime { seconds } ${RATING_FIELDS} series { episodeNumber { episodeNumber seasonNumber } }`;

const quote = (value: string) => JSON.stringify(value);

const searchTitleType = (type: MediaType) => (type === "movie" ? "MOVIE" : "TV_SERIES");
const browseTitleType = (type: MediaType) => (type === "movie" ? "movie" : "tvSeries");

export interface BrowseQueryOptions {
  type: MediaType;
  cursor?: string;
  genres: readonly string[];
  byRating: boolean;
}

export const imdbQueries = {
  title: (id: string) => `query { title(id: ${quote(id)}) { ${TITLE_FIELDS} } }`,

  rating: (id: string) => `query { title(id: ${quote(id)}) { ${RATING_FIELDS} } }`,

  episodes: (id: string, cursor?: string) =>
    `query { title(id: ${quote(id)}) { episodes { episodes(first: ${IMDB_EPISODE_PAGE_SIZE}${cursor ? `, after: ${quote(cursor)}` : ""}) { edges { node { ${TITLE_FIELDS} } } pageInfo { endCursor hasNextPage } } } } }`,

  search: (term: string, type: MediaType) =>
    `query { mainSearch(first: 20, options: { searchTerm: ${quote(term)}, type: ${searchTitleType(type)} }) { edges { node { entity { ... on Title { ${CARD_FIELDS} } } } } } }`,

  browse: ({ type, cursor, genres, byRating }: BrowseQueryOptions) => {
    const genreConstraint = genres.length
      ? `genreConstraint: { allGenreIds: [${genres.map(quote).join(", ")}] }`
      : "";
    const after = cursor ? `, after: ${quote(cursor)}` : "";
    const sort = byRating
      ? "sortBy: USER_RATING, sortOrder: DESC"
      : "sortBy: POPULARITY, sortOrder: ASC";
    return `query { advancedTitleSearch(first: ${IMDB_PAGE_SIZE}${after}, constraints: { titleTypeConstraint: { anyTitleTypeIds: [${quote(browseTitleType(type))}] } ${genreConstraint} }, sort: { ${sort} }) { total edges { node { title { ${CARD_FIELDS} } } } pageInfo { endCursor hasNextPage } } }`;
  },

  detail: (id: string) => `query { title(id: ${quote(id)}) { ${DETAIL_FIELDS} } }`,

  related: (id: string, limit: number) =>
    `query { title(id: ${quote(id)}) { moreLikeThisTitles(first: ${limit}) { edges { node { ${CARD_FIELDS} } } } } }`,

  credits: (id: string) =>
    `query { title(id: ${quote(id)}) { principalCredits { category { id } credits { name { id nameText { text } primaryImage { url } } characters { name } } } } }`,

  videos: (id: string) =>
    `query { title(id: ${quote(id)}) { videos(first: 20) { edges { node { id name { value } contentType { displayName { value } } isMature } } } } }`,

  seasonEpisodes: (id: string) =>
    `query { title(id: ${quote(id)}) { episodes { episodes(first: ${IMDB_EPISODE_PAGE_SIZE}) { edges { node { ${SEASON_EPISODE_FIELDS} } } } } } }`
};
