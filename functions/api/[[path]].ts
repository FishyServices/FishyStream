import { fetchAnimeCatalog } from "@fishy/providers/anime/anilist";
import { handleOpenSubtitlesRequest } from "@fishy/providers/subtitles";
import { handleApiRequest, type PagesFunctionContext } from "@fishy/scraper/pages-handler";

export function onRequest(context: PagesFunctionContext) {
  const path = Array.isArray(context.params.path)
    ? context.params.path.join("/")
    : (context.params.path ?? "");
  if (path === "subtitles" || path.startsWith("subtitles/"))
    return handleOpenSubtitlesRequest(context.request);
  return handleApiRequest(context, fetchAnimeCatalog);
}
