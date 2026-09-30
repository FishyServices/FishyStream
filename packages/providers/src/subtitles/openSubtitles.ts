export interface OpenSubtitleSearchOptions {
  imdbId: string;
  season?: number;
  episode?: number;
}

export interface OpenSubtitleTrack {
  downloadUrl: string;
  languageCode: string;
  languageName: string;
  format: "srt" | "vtt" | "ass";
}

type LegacySubtitleResult = {
  SubDownloadLink?: unknown;
  SubFormat?: unknown;
  SubLanguageID?: unknown;
  LanguageName?: unknown;
};

const OPEN_SUBTITLES_SEARCH_URL = "https://rest.opensubtitles.org/search";
const OPEN_SUBTITLES_USER_AGENT = "FishyStream/0.1";
const SEARCH_LANGUAGES = [
  "eng",
  "spa",
  "fre",
  "ger",
  "ita",
  "por",
  "rus",
  "ara",
  "chi",
  "jpn",
  "kor",
  "tur",
  "pol",
  "dut",
  "hin"
] as const;

function subtitleSearchUrl(options: OpenSubtitleSearchOptions, language: string): string {
  const imdbId = options.imdbId.replace(/^tt/i, "");
  const segments: string[] = [];
  if (options.episode !== undefined) segments.push(`episode-${options.episode}`);
  segments.push(`imdbid-${imdbId}`);
  if (options.season !== undefined) segments.push(`season-${options.season}`);
  segments.push(`sublanguageid-${language}`);
  return `${OPEN_SUBTITLES_SEARCH_URL}/${segments.join("/")}`;
}

function asResults(value: unknown): LegacySubtitleResult[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is LegacySubtitleResult => {
    return typeof item === "object" && item !== null;
  });
}

function format(value: unknown): OpenSubtitleTrack["format"] {
  return value === "vtt" || value === "ass" ? value : "srt";
}

async function searchLanguage(
  options: OpenSubtitleSearchOptions,
  language: string
): Promise<OpenSubtitleTrack | null> {
  const response = await fetch(subtitleSearchUrl(options, language), {
    headers: { "X-User-Agent": OPEN_SUBTITLES_USER_AGENT }
  });
  if (!response.ok) return null;

  const result = asResults(await response.json()).find(
    (item) =>
      typeof item.SubDownloadLink === "string" &&
      item.SubDownloadLink.startsWith("https://dl.opensubtitles.org/en/download/") &&
      typeof item.SubLanguageID === "string"
  );
  if (!result || typeof result.SubDownloadLink !== "string") return null;

  return {
    downloadUrl: result.SubDownloadLink,
    languageCode: typeof result.SubLanguageID === "string" ? result.SubLanguageID : language,
    languageName: typeof result.LanguageName === "string" ? result.LanguageName : language,
    format: format(result.SubFormat)
  };
}

export async function searchOpenSubtitles(
  options: OpenSubtitleSearchOptions
): Promise<OpenSubtitleTrack[]> {
  const results = await Promise.allSettled(
    SEARCH_LANGUAGES.map((language) => searchLanguage(options, language))
  );
  return results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
}

export async function downloadOpenSubtitle(downloadUrl: string): Promise<ArrayBuffer> {
  const url = new URL(downloadUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "dl.opensubtitles.org" ||
    !url.pathname.startsWith("/en/download/")
  ) {
    throw new Error("Invalid OpenSubtitles download URL");
  }
  const response = await fetch(url, {
    headers: { "X-User-Agent": OPEN_SUBTITLES_USER_AGENT }
  });
  if (!response.ok) throw new Error(`OpenSubtitles download failed: ${response.status}`);
  return response.arrayBuffer();
}
