export type IMDbId = `tt${string}`;

export interface IMDbRating {
  value: number;
  voteCount: number;
}

export interface IMDbTitle {
  id: IMDbId;
  title: string;
  rating?: IMDbRating;
}

export interface IMDbEpisode extends IMDbTitle {}

export interface IMDbEpisodePage {
  episodes: IMDbEpisode[];
  nextCursor?: string;
}

export interface IMDbGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

export type IMDbRequest = (query: string, signal?: AbortSignal) => Promise<unknown>;

export interface IMDbClient {
  getTitle(id: IMDbId, signal?: AbortSignal): Promise<IMDbTitle | null>;
  getTitleRating(id: IMDbId, signal?: AbortSignal): Promise<IMDbRating | null>;
  getEpisodePage(id: IMDbId, cursor?: string, signal?: AbortSignal): Promise<IMDbEpisodePage>;
}
