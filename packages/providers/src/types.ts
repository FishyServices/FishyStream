export interface AniListEpisodeMapping {
  episodeNumber: number;
  anilistId: string;
  anilistEpisodeNumber: number;
}

export type MediaType = "movie" | "tv";

export interface TitleReference {
  id: string;
  type?: MediaType;
  seasonNumber?: number;
  cursor?: string;
}

export interface Rating {
  value: number;
  voteCount?: number;
}

export interface Title {
  id: string;
  type?: MediaType;
  title: string;
  rating?: Rating;
}

export interface Episode {
  id: string;
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
