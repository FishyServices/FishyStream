import { downloadOpenSubtitle, searchOpenSubtitles } from "./openSubtitles.js";

const DOWNLOAD_PATH = "/api/subtitles/download";
const GZIP_MAGIC = [0x1f, 0x8b] as const;

function parseNumber(value: string | null): number | undefined {
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

async function decodeSubtitle(bytes: ArrayBuffer): Promise<string> {
  const view = new Uint8Array(bytes);
  if (view[0] !== GZIP_MAGIC[0] || view[1] !== GZIP_MAGIC[1])
    return new TextDecoder().decode(bytes);
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

async function handleDownload(downloadUrl: string): Promise<Response> {
  try {
    const subtitle = await decodeSubtitle(await downloadOpenSubtitle(downloadUrl));
    return new Response(subtitle, {
      headers: {
        "Content-Type": "application/x-subrip; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch {
    return new Response("OpenSubtitles is unavailable.", { status: 502 });
  }
}

export async function handleOpenSubtitlesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const downloadUrl = url.pathname === DOWNLOAD_PATH ? url.searchParams.get("url") : null;
  if (downloadUrl) return handleDownload(downloadUrl);

  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  const imdbId = url.searchParams.get("imdbId")?.replace(/^tt/i, "");
  if (!imdbId || !/^\d+$/.test(imdbId)) {
    return new Response("A numeric IMDb ID is required.", { status: 400 });
  }

  const seasonValue = url.searchParams.get("season");
  const episodeValue = url.searchParams.get("episode");
  const season = parseNumber(seasonValue);
  const episode = parseNumber(episodeValue);
  if (
    (seasonValue !== null && season === undefined) ||
    (episodeValue !== null && episode === undefined)
  ) {
    return new Response("Season and episode must be numeric.", { status: 400 });
  }

  try {
    const tracks = await searchOpenSubtitles({ imdbId, season, episode });
    return Response.json({
      tracks: tracks.map((track) => ({
        url: new URL(`${DOWNLOAD_PATH}?url=${encodeURIComponent(track.downloadUrl)}`, request.url)
          .href,
        label: track.languageName,
        language: track.languageCode,
        type: track.format
      }))
    });
  } catch {
    return Response.json({ tracks: [] });
  }
}
