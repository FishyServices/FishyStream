import type {
  ContentCard,
  ContentDetail,
  ContentFeatured,
  ContentPlayback
} from "@content/contentMetadata";

export interface ContentCatalog {
  search(query: string, page?: number): Promise<ContentCard[]>;
  discover(args: { type: "movie" | "tv"; page?: number; sort?: string }): Promise<ContentCard[]>;
  getDetails(id: string, type: "movie" | "tv"): Promise<ContentDetail | null>;
  getFeatured(): Promise<ContentFeatured[]>;
  getPlayback(
    id: string,
    type: "movie" | "tv",
    signal?: AbortSignal
  ): Promise<ContentPlayback | null>;
}

export type ContentCatalogPlayback = Pick<ContentCatalog, "getPlayback">;
