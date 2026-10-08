export type ScraperMediaType = "hls" | "file";

export type ScraperTrack = {
  file: string;
  label?: string;
};

export type ScraperSegment = {
  start: number;
  end: number;
};

export type ScrapedStream = {
  name: string;
  sourceKey?: string;
  streamUrl: string;
  mediaType: ScraperMediaType;
  tracks: ScraperTrack[];
  intro?: ScraperSegment;
  outro?: ScraperSegment;
};

export type ScraperSourceOption = { key: string; name: string };
export type ScrapeResult = { source: ScrapedStream | null; sourceOptions: ScraperSourceOption[] };

export type ScraperClient = {
  scrape(url: string, signal?: AbortSignal): Promise<ScrapeResult>;
  resolveSource(url: string, source: string, signal?: AbortSignal): Promise<ScrapedStream | null>;
};

type ScraperFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSegment(value: unknown): ScraperSegment | undefined {
  if (!isRecord(value) || typeof value.start !== "number" || typeof value.end !== "number")
    return undefined;
  return value.end > value.start ? { start: value.start, end: value.end } : undefined;
}

function parseStream(value: unknown): ScrapedStream | null {
  if (
    !isRecord(value) ||
    typeof value.streamUrl !== "string" ||
    !value.streamUrl ||
    (value.mediaType !== "hls" && value.mediaType !== "file")
  )
    return null;

  const tracks = Array.isArray(value.tracks)
    ? value.tracks.flatMap((track): ScraperTrack[] =>
        isRecord(track) && typeof track.file === "string" && track.file
          ? [
              {
                file: track.file,
                ...(typeof track.label === "string" ? { label: track.label } : {})
              }
            ]
          : []
      )
    : [];

  return {
    name: typeof value.name === "string" ? value.name : "Stream",
    ...(typeof value.sourceKey === "string" ? { sourceKey: value.sourceKey } : {}),
    streamUrl: value.streamUrl,
    mediaType: value.mediaType,
    tracks,
    ...(parseSegment(value.intro) ? { intro: parseSegment(value.intro) } : {}),
    ...(parseSegment(value.outro) ? { outro: parseSegment(value.outro) } : {})
  };
}

function parseSourceOptions(value: unknown): ScraperSourceOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((option): ScraperSourceOption[] =>
    isRecord(option) && typeof option.key === "string" && typeof option.name === "string"
      ? [{ key: option.key, name: option.name }]
      : []
  );
}

export function createScraperClient(options: {
  baseUrl: string;
  fetch?: ScraperFetch;
}): ScraperClient {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetcher = options.fetch ?? globalThis.fetch;

  async function request(path: string, params: Record<string, string>, signal?: AbortSignal) {
    const url = new URL(path, `${baseUrl}/`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const response = await fetcher(url, { signal });
    if (!response.ok) throw new Error(`Scraper request failed (${response.status}).`);
    const value: unknown = await response.json();
    return value;
  }

  return {
    async scrape(url, signal) {
      const value = await request("/api/scrape", { url }, signal);
      if (!isRecord(value)) return { source: null, sourceOptions: [] };
      return { source: parseStream(value), sourceOptions: parseSourceOptions(value.sourceOptions) };
    },
    async resolveSource(url, source, signal) {
      return parseStream(await request("/api/scrape/source", { url, source }, signal));
    }
  };
}
