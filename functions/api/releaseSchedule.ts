import {
  getUpcomingAnimeReleaseSchedule,
  type SelectedAnimeTitle
} from "../../packages/providers/src/anime/releaseSchedule.ts";

interface ReleaseScheduleBindings {
  ANIMESCHEDULE_API_TOKEN?: string;
  ANIDUB_API_KEY?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" }
  });
}

export async function handleReleaseScheduleRequest(request: Request, env: ReleaseScheduleBindings) {
  if (request.method !== "POST") return json({ message: "Method Not Allowed" }, 405);
  const token = env.ANIMESCHEDULE_API_TOKEN?.trim();
  if (!token) return json({ message: "AnimeSchedule is not configured for this deployment." }, 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ message: "Request body must be valid JSON." }, 400);
  }
  const selected =
    typeof body === "object" && body !== null && "selected" in body ? body.selected : undefined;
  if (
    !Array.isArray(selected) ||
    selected.length > 50 ||
    selected.some(
      (item) =>
        typeof item !== "object" ||
        item === null ||
        !("contentId" in item) ||
        typeof item.contentId !== "string" ||
        !("title" in item) ||
        typeof item.title !== "string" ||
        !item.title.trim()
    )
  )
    return json({ message: "Select between 1 and 50 valid bookmarked titles." }, 400);

  try {
    const result = await getUpcomingAnimeReleaseSchedule(selected as SelectedAnimeTitle[], {
      animeScheduleToken: token,
      aniDubApiKey: env.ANIDUB_API_KEY
    });
    return json(result);
  } catch (error) {
    return json(
      {
        message: error instanceof Error ? error.message : "Anime release schedule is unavailable."
      },
      502
    );
  }
}
