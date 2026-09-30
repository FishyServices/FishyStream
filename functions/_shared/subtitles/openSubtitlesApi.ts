import {
  downloadOpenSubtitle,
  searchOpenSubtitles,
  type OpenSubtitleSearchOptions
} from "../../../packages/providers/src/subtitles/index";

function parseNumber(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  return Number(value);
}

async function readSubtitle(bytes: ArrayBuffer): Promise<string> {
  const view = new Uint8Array(bytes);
  if (view[0] !== 0x1f || view[1] !== 0x8b) return new TextDecoder().decode(bytes);

  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

export async function handleOpenSubtitlesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const downloadUrl =
    url.pathname === "/api/subtitles/download" ? url.searchParams.get("url") : null;

  if (downloadUrl) {
    try {
      const subtitle = await readSubtitle(await downloadOpenSubtitle(downloadUrl));
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

  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
  const imdbId = url.searchParams.get("imdbId")?.replace(/^tt/i, "");
  const seasonValue = url.searchParams.get("season");
  const episodeValue = url.searchParams.get("episode");
  const season = parseNumber(seasonValue);
  const episode = parseNumber(episodeValue);

  if (!imdbId || !/^\d+$/.test(imdbId))
    return new Response("A numeric IMDb ID is required.", { status: 400 });
  if (
    (seasonValue !== null && season === undefined) ||
    (episodeValue !== null && episode === undefined)
  )
    return new Response("Season and episode must be numeric.", { status: 400 });

  try {
    const options: OpenSubtitleSearchOptions = { imdbId, season, episode };
    const tracks = await searchOpenSubtitles(options);
    return Response.json({
      tracks: tracks.map((track) => ({
        url: new URL(
          `/api/subtitles/download?url=${encodeURIComponent(track.downloadUrl)}`,
          request.url
        ).href,
        label: track.languageName,
        language: track.languageCode,
        type: track.format
      }))
    });
  } catch {
    return Response.json({ tracks: [] });
  }
}
