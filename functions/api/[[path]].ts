import { handleApiRequest, type PagesFunctionContext } from "../_shared/runtime/proxyHandlers";
import { handleOpenSubtitlesRequest } from "../_shared/subtitles/openSubtitlesApi";

export function onRequest(context: PagesFunctionContext) {
  const path = Array.isArray(context.params.path)
    ? context.params.path.join("/")
    : (context.params.path ?? "");
  if (path === "subtitles" || path.startsWith("subtitles/"))
    return handleOpenSubtitlesRequest(context.request);
  return handleApiRequest(context);
}
