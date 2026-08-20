import type { ContentId, ContentType } from "@content/contentMetadata";

export interface DownloadItem {
  source: string;
  name: string;
  url: string;
  direct: boolean;
  headers?: Record<string, string>;
}

type DownloadContent = {
  title: string;
  type: ContentType;
  tmdbId?: string;
  anilistId?: string;
  _id: ContentId;
};
type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function headersValue(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).filter((entry): entry is [string, string] => {
    return typeof entry[1] === "string";
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function fetchDownloads(
  resolvedContent: DownloadContent,
  selectedSeason: number,
  selectedEpisode: number,
  episodeTitle?: string
): Promise<DownloadItem[]> {
  const scraperHost = import.meta.env.DEV ? "http://localhost:4000" : "";

  const tmdbId = resolvedContent.tmdbId || resolvedContent._id.split(":").at(-1) || "";
  const type: ContentType = resolvedContent.type;
  const currentSeason = selectedSeason;
  const currentEpisode = selectedEpisode;

  const results: DownloadItem[] = [];

  // 1Embed
  let embedUrl = "";
  if (type === "tv") {
    embedUrl = `https://1embed.cc/download/tv/${tmdbId}/${currentSeason}/${currentEpisode}`;
  } else {
    embedUrl = `https://1embed.cc/download/movie/${tmdbId}`;
  }
  results.push({
    source: "1Embed.cc",
    name: "Open Download Page (1Embed)",
    url: embedUrl,
    direct: false
  });

  // 02MovieDownloader
  let movieDownloaderUrl = "";
  if (type === "tv") {
    movieDownloaderUrl = `https://02moviedownloader.site/api/download/tv/${tmdbId}/${currentSeason}/${currentEpisode}`;
  } else {
    movieDownloaderUrl = `https://02moviedownloader.site/api/download/movie/${tmdbId}`;
  }
  results.push({
    source: "02MovieDownloader",
    name: "Open Download Page (02Movie)",
    url: movieDownloaderUrl,
    direct: false
  });

  // AnimeShrine
  if (type === "tv") {
    const titleSlug = slugify(resolvedContent.title || "");
    const epString = String(currentEpisode);
    const epStringFloat = `${currentEpisode}.0`;

    results.push({
      source: "AnimeShrine",
      name: `Open Download Page (AnimeShrine - Ep ${currentEpisode})`,
      url: `https://animeshrine.xyz/download/${titleSlug}/episode-${currentEpisode}/${tmdbId}-1:${currentSeason}:${epString}`,
      direct: false
    });
    results.push({
      source: "AnimeShrine",
      name: `Open Download Page (AnimeShrine - Ep ${currentEpisode}.0)`,
      url: `https://animeshrine.xyz/download/${titleSlug}/episode-${currentEpisode}/${tmdbId}-1:${currentSeason}:${epStringFloat}`,
      direct: false
    });

    if (episodeTitle) {
      const epTitleSlug = slugify(episodeTitle);
      results.push({
        source: "AnimeShrine",
        name: `Open Download Page (AnimeShrine - Title - Ep ${currentEpisode})`,
        url: `https://animeshrine.xyz/download/${titleSlug}/${epTitleSlug}/${tmdbId}-1:${currentSeason}:${epString}`,
        direct: false
      });
      results.push({
        source: "AnimeShrine",
        name: `Open Download Page (AnimeShrine - Title - Ep ${currentEpisode}.0)`,
        url: `https://animeshrine.xyz/download/${titleSlug}/${epTitleSlug}/${tmdbId}-1:${currentSeason}:${epStringFloat}`,
        direct: false
      });
    }
  }

  // StreamRip
  try {
    const streamripUrl = `${scraperHost}/api/download/streamrip?type=${type}&id=${tmdbId}&season=${currentSeason}&episode=${currentEpisode}`;
    const res = await fetch(streamripUrl);
    if (res.ok) {
      const data: unknown = await res.json();
      if (isRecord(data)) {
        records(data.downloads).forEach((dl) => {
          results.push({
            source: "StreamRip",
            name: `${stringValue(dl.server)} - ${stringValue(dl.quality)}p (${stringValue(dl.size, "Unknown size")})`,
            url: stringValue(dl.url),
            headers: headersValue(dl._headers) ?? headersValue(dl.headers),
            direct: true
          });
        });
      }
    }
  } catch (e) {
    console.error("StreamRip fetch failed:", e);
  }

  // AniSnatch
  try {
    const aniId = resolvedContent.anilistId || tmdbId;
    const anisnatchUrl = `${scraperHost}/api/download/anisnatch?id=${aniId}&episode=${currentEpisode}`;
    const res = await fetch(anisnatchUrl);
    if (res.ok) {
      const data: unknown = await res.json();
      if (isRecord(data)) {
        records(data.downloads).forEach((dl) => {
          results.push({
            source: "AniSnatch",
            name: stringValue(dl.name),
            url: stringValue(dl.url),
            direct: true
          });
        });
      }
    }
  } catch (e) {
    console.error("AniSnatch fetch failed:", e);
  }

  // Animex
  try {
    const query = resolvedContent.title;
    const animexUrl = `${scraperHost}/api/download/animex?q=${encodeURIComponent(query)}`;
    const res = await fetch(animexUrl);
    if (res.ok) {
      const data: unknown = await res.json();
      const items = records(data);
      if (items.length > 0) {
        const resolvePromises = items.slice(0, 2).map(async (item) => {
          const itemId = stringValue(item.id);
          if (!itemId) return null;
          try {
            const resolveRes = await fetch(
              `${scraperHost}/api/download/animex?id=${encodeURIComponent(itemId)}`
            );
            if (resolveRes.ok) {
              const resolveData: unknown = await resolveRes.json();
              if (isRecord(resolveData)) {
                return records(resolveData.downloads);
              }
            }
          } catch (e) {
            console.error("Animex resolve failed for", itemId, e);
          }
          return null;
        });

        const resolvedBundles = await Promise.all(resolvePromises);
        let addedAny = false;

        resolvedBundles.forEach((bundle) => {
          if (bundle) {
            bundle.forEach((dl) => {
              results.push({
                source: "Animex",
                name: stringValue(dl.text),
                url: stringValue(dl.url),
                direct: true
              });
              addedAny = true;
            });
          }
        });

        if (!addedAny) {
          items.forEach((dl) => {
            const itemId = stringValue(dl.id);
            results.push({
              source: "Animex",
              name: stringValue(dl.title),
              url: `https://animex.one/community/download?id=${encodeURIComponent(itemId)}`,
              direct: false
            });
          });
        }
      }
    }
  } catch (e) {
    console.error("Animex fetch failed:", e);
  }

  return results;
}
