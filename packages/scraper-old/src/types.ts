export type Bindings = {
  MYBROWSER: any;
  launchBrowser: () => Promise<any>;
};

export type StreamHeaders = {
  Referer?: string;
  Origin?: string;
  [key: string]: string | undefined;
};

export type MediaType = "hls" | "file";
export type JsonRecord = Record<string, unknown>;

export type StreamResult = {
  url: string;
  mediaType: MediaType;
  headers: StreamHeaders;
  tracks?: unknown;
  intro?: unknown;
  outro?: unknown;
};

export type MediaCandidate = {
  url: string;
  mediaType: MediaType;
  headers?: StreamHeaders;
};

export type SourcesPayload = {
  file: string;
  mediaType: MediaType;
  headers?: StreamHeaders;
  tracks?: unknown;
  intro?: unknown;
  outro?: unknown;
};
