import type { ContentDetail } from "@content/contentMetadata";

export interface DownloadItem {
  source: string;
  name: string;
  url: string;
  direct: boolean;
  headers?: Record<string, string>;
}

export async function fetchDownloads(
  resolvedContent: any,
  selectedSeason: number,
  selectedEpisode: number
): Promise<DownloadItem[]> {
  const scraperHost = import.meta.env.DEV ? "http://localhost:4000" : "";

  const tmdbId = resolvedContent.tmdbId || resolvedContent._id.split(":").at(-1) || "";
  const type = resolvedContent.type;
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

  // StreamRip
  try {
    const streamripUrl = `${scraperHost}/api/download/streamrip?type=${type}&id=${tmdbId}&season=${currentSeason}&episode=${currentEpisode}`;
    const res = await fetch(streamripUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.downloads && Array.isArray(data.downloads)) {
        data.downloads.forEach((dl: any) => {
          results.push({
            source: "StreamRip",
            name: `${dl.server} - ${dl.quality}p (${dl.size || "Unknown size"})`,
            url: dl.url,
            headers: dl._headers || dl.headers,
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
    const aniId =
      ("anilistId" in resolvedContent ? (resolvedContent as any).anilistId : undefined) || tmdbId;
    const anisnatchUrl = `${scraperHost}/api/download/anisnatch?id=${aniId}&episode=${currentEpisode}`;
    const res = await fetch(anisnatchUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.downloads && Array.isArray(data.downloads)) {
        data.downloads.forEach((dl: any) => {
          results.push({
            source: "AniSnatch",
            name: dl.name,
            url: dl.url,
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
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const resolvePromises = data.slice(0, 2).map(async (item: any) => {
          try {
            const resolveRes = await fetch(
              `${scraperHost}/api/download/animex?id=${encodeURIComponent(item.id)}`
            );
            if (resolveRes.ok) {
              const resolveData = await resolveRes.json();
              if (resolveData.downloads && Array.isArray(resolveData.downloads)) {
                return resolveData.downloads;
              }
            }
          } catch (e) {
            console.error("Animex resolve failed for", item.id, e);
          }
          return null;
        });

        const resolvedBundles = await Promise.all(resolvePromises);
        let addedAny = false;

        resolvedBundles.forEach((bundle) => {
          if (bundle) {
            bundle.forEach((dl: any) => {
              results.push({
                source: "Animex",
                name: dl.text,
                url: dl.url,
                direct: true
              });
              addedAny = true;
            });
          }
        });

        if (!addedAny) {
          data.forEach((dl: any) => {
            results.push({
              source: "Animex",
              name: dl.title,
              url: `https://animex.one/community/download?id=${dl.id}`,
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
