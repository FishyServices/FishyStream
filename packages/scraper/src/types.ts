export type MediaType = "hls" | "file";

export type StreamHeaders = Record<string, string>;

export type Stream = {
  url: string;
  mediaType: MediaType;
  headers: StreamHeaders;
  tracks?: unknown;
  intro?: unknown;
  outro?: unknown;
};

export type ScrapeBindings = Record<string, never>;
