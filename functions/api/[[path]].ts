import { fetchAnimeCatalog } from "@fishy/providers/anime/anilist";
import { fetchJikanAnimeCatalog } from "@fishy/providers/anime/jikan";
import { fetchKitsuAnimeCatalog } from "@fishy/providers/anime/kitsu";
import { handleOpenSubtitlesRequest } from "@fishy/providers/subtitles";
import { handleReleaseScheduleRequest } from "@fishy/providers/api";
import { handleApiRequest, type PagesFunctionContext } from "@fishy/scraper/pages-handler";

export function onRequest(context: PagesFunctionContext) {
  const path = Array.isArray(context.params.path)
    ? context.params.path.join("/")
    : (context.params.path ?? "");
  if (path === "subtitles" || path.startsWith("subtitles/"))
    return handleOpenSubtitlesRequest(context.request);
  if (path === "anime-release-schedule")
    return handleReleaseScheduleRequest(context.request, context.env);
  return handleApiRequest(context, (url, apiKey) => {
    const backend = new URL(url).searchParams.get("backend");
    return backend === "anilist"
      ? fetchAnimeCatalog(url, apiKey)
      : backend === "jikan"
        ? fetchJikanAnimeCatalog(url, apiKey)
        : fetchKitsuAnimeCatalog(url, apiKey);
  });
}
