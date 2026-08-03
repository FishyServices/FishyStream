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
