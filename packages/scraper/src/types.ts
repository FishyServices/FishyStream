export type MediaType = "hls" | "file";

export type StreamHeaders = Record<string, string>;

export type Stream = {
  url: string;
  mediaType: MediaType;
  headers: StreamHeaders;
  name?: string;
  sourceKey?: string;
  tracks?: unknown;
  intro?: unknown;
  outro?: unknown;
};

export type StreamSourceOption = {
  key: string;
  name: string;
};

export type ScrapeBindings = Record<string, never>;
