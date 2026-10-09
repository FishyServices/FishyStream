export interface OpenSubtitleSearchOptions {
  imdbId: string;
  season?: number;
  episode?: number;
}

export type OpenSubtitleFormat = "srt" | "vtt" | "ass";

export interface OpenSubtitleTrack {
  downloadUrl: string;
  languageCode: string;
  languageName: string;
  format: OpenSubtitleFormat;
}

interface LegacySubtitleResult {
  SubDownloadLink?: unknown;
  SubFormat?: unknown;
  SubLanguageID?: unknown;
  LanguageName?: unknown;
}

const SEARCH_URL = "https://rest.opensubtitles.org/search";
const DOWNLOAD_HOST = "dl.opensubtitles.org";
const DOWNLOAD_PATH_PREFIX = "/en/download/";
const USER_AGENT = "FishyStream/0.1";
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

function buildSearchUrl(options: OpenSubtitleSearchOptions, language: string): string {
  const segments = [
    options.episode === undefined ? undefined : `episode-${options.episode}`,
    `imdbid-${options.imdbId.replace(/^tt/i, "")}`,
    options.season === undefined ? undefined : `season-${options.season}`,
    `sublanguageid-${language}`
  ];
  return `${SEARCH_URL}/${segments.filter(Boolean).join("/")}`;
}

function isDownloadLink(value: unknown): value is string {
  return (
    typeof value === "string" && value.startsWith(`https://${DOWNLOAD_HOST}${DOWNLOAD_PATH_PREFIX}`)
  );
}

function toFormat(value: unknown): OpenSubtitleFormat {
  return value === "vtt" || value === "ass" ? value : "srt";
}

async function searchLanguage(
  options: OpenSubtitleSearchOptions,
  language: string
): Promise<OpenSubtitleTrack | null> {
  const response = await fetch(buildSearchUrl(options, language), {
    headers: { "X-User-Agent": USER_AGENT }
  });
  if (!response.ok) return null;

  const payload: unknown = await response.json();
  const results = Array.isArray(payload) ? (payload as LegacySubtitleResult[]) : [];
  const match = results.find(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      isDownloadLink(item.SubDownloadLink) &&
      typeof item.SubLanguageID === "string"
  );
  if (!match || !isDownloadLink(match.SubDownloadLink)) return null;

  return {
    downloadUrl: match.SubDownloadLink,
    languageCode: typeof match.SubLanguageID === "string" ? match.SubLanguageID : language,
    languageName: typeof match.LanguageName === "string" ? match.LanguageName : language,
    format: toFormat(match.SubFormat)
  };
}

export async function searchOpenSubtitles(
  options: OpenSubtitleSearchOptions
): Promise<OpenSubtitleTrack[]> {
  const results = await Promise.all(
    SEARCH_LANGUAGES.map((language) => searchLanguage(options, language).catch(() => null))
  );
  return results.filter((track): track is OpenSubtitleTrack => track !== null);
}

export async function downloadOpenSubtitle(downloadUrl: string): Promise<ArrayBuffer> {
  const url = new URL(downloadUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== DOWNLOAD_HOST ||
    !url.pathname.startsWith(DOWNLOAD_PATH_PREFIX)
  ) {
    throw new Error("Invalid OpenSubtitles download URL");
  }
  const response = await fetch(url, { headers: { "X-User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`OpenSubtitles download failed: ${response.status}`);
  return response.arrayBuffer();
}
