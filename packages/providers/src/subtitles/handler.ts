import { searchOpenSubtitles } from "./openSubtitles.js";

function parseNumber(value: string | null): number | undefined {
  return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

export async function handleOpenSubtitlesRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
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
        url: track.downloadUrl,
        label: track.languageName,
        language: track.languageCode,
        type: track.format
      }))
    });
  } catch {
    return Response.json({ tracks: [] });
  }
}
