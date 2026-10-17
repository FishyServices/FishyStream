import { createAniDubClient, createAniDubRequest, type AniDubStatus } from "./anidub/index.js";
import {
  createAnimeScheduleClient,
  createAnimeScheduleRequest,
  type AnimeScheduleTitle
} from "./animeschedule/index.js";

export interface SelectedAnimeTitle {
  contentId: string;
  title: string;
}

export interface AnimeReleaseScheduleEntry {
  contentId: string;
  title: string;
  matched: boolean;
  sub: Array<{ episode: number; date: string; platform: string | null; estimated: boolean }>;
  dub: Array<{ episode: number; date: string; platform: string | null; estimated: boolean }>;
  dubProgress: AniDubStatus | null;
  dubbedEpisodes: number | null;
  totalEpisodes: number | null;
  dubConfidence: number | null;
  dubReason: string | null;
  dubVerifiedAt: string | null;
}

function normalizedTitle(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function isoWeek(date: Date) {
  const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  return {
    year: thursday.getUTCFullYear(),
    week: Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  };
}

function aniListId(anime: AnimeScheduleTitle) {
  const reference = anime.websites?.aniList ?? "";
  const match = reference.match(/(?:anime\/)?(\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function matchesTitle(candidateTitle: string, bookmarkTitle: string) {
  if (candidateTitle === bookmarkTitle) return true;
  if (!candidateTitle.startsWith(bookmarkTitle)) return false;
  return /^(?:ii|iii|iv|v|\d+|season\d+|s\d+|part\d+)$/i.test(
    candidateTitle.slice(bookmarkTitle.length)
  );
}

export async function getUpcomingAnimeReleaseSchedule(
  selected: readonly SelectedAnimeTitle[],
  options: { animeScheduleToken: string; aniDubApiKey?: string }
): Promise<AnimeReleaseScheduleEntry[]> {
  if (!selected.length) return [];
  if (selected.length > 50) throw new Error("Select at most 50 titles for the release calendar.");

  const schedule = createAnimeScheduleClient(
    createAnimeScheduleRequest(options.animeScheduleToken)
  );
  const searches = await Promise.all(
    selected.map(async (item) => ({
      ...item,
      matches: await schedule.searchAnime(item.title)
    }))
  );
  const matched = searches.map(({ contentId, title, matches }) => {
    const query = normalizedTitle(title);
    const anime = matches.filter((candidate) => {
      if (candidate.format === "MOVIE") return false;
      const types =
        candidate.mediaTypes?.map((type) =>
          normalizedTitle(`${type.name ?? ""}${type.route ?? ""}`)
        ) ?? [];
      if (types.length && !types.some((type) => type.includes("tv") || type.includes("ona")))
        return false;
      const names = [
        candidate.title,
        candidate.names.english,
        candidate.names.romaji,
        candidate.names.native,
        ...(candidate.names.synonyms ?? [])
      ]
        .filter((name): name is string => !!name)
        .map(normalizedTitle);
      return names.some((name) => matchesTitle(name, query));
    });
    return { contentId, title, anime };
  });

  const routes = new Set(matched.flatMap(({ anime }) => anime.map((entry) => entry.route)));
  const aniListIds = [
    ...new Set(
      matched.flatMap(({ anime }) =>
        anime.map(aniListId).filter((id): id is number => id !== undefined)
      )
    )
  ];
  const start = new Date();
  const weeks = Array.from({ length: 5 }, (_, index) =>
    isoWeek(new Date(start.getTime() + index * 7 * 86_400_000))
  );
  const timetables = await Promise.all(
    weeks.flatMap((week) =>
      (["sub", "dub"] as const).map((type) =>
        schedule.getTimetable(type, { ...week, timeZone: "UTC" })
      )
    )
  );
  const now = Date.now();
  const futureEpisodes = timetables
    .flat()
    .filter(
      (episode) =>
        routes.has(episode.route) &&
        Date.parse(episode.episodeDate) >= now &&
        Date.parse(episode.episodeDate) <= now + 31 * 86_400_000
    );
  const dubLookup = aniListIds.length
    ? await createAniDubClient(createAniDubRequest(options.aniDubApiKey)).lookupAnime(
        aniListIds.slice(0, 50)
      )
    : { results: [], notFound: [] };
  const dubByAniListId = new Map(dubLookup.results.map((anime) => [anime.anilistId, anime]));

  return matched.flatMap(({ contentId, title, anime }): AnimeReleaseScheduleEntry[] => {
    if (!anime.length)
      return [
        {
          contentId,
          title,
          matched: false,
          sub: [],
          dub: [],
          dubProgress: null,
          dubbedEpisodes: null,
          totalEpisodes: null,
          dubConfidence: null,
          dubReason: null,
          dubVerifiedAt: null
        }
      ];
    return anime.map((entry) => {
      const record = aniListId(entry) ? dubByAniListId.get(aniListId(entry)!) : undefined;
      const episodes = futureEpisodes.filter((episode) => episode.route === entry.route);
      const upcoming = (type: "sub" | "dub") =>
        episodes
          .filter((episode) => episode.airType === type)
          .sort((a, b) => Date.parse(a.episodeDate) - Date.parse(b.episodeDate))
          .map((episode) => ({
            episode: episode.episodeNumber,
            date: episode.episodeDate,
            platform: episode.platform ?? null,
            estimated: episode.estimated ?? false
          }));
      return {
        contentId,
        title: entry.title,
        matched: true,
        sub: upcoming("sub"),
        dub: upcoming("dub"),
        dubProgress: record?.dub?.status ?? null,
        dubbedEpisodes: record?.dub?.dubbedEpisodes ?? null,
        totalEpisodes: record?.episodes ?? entry.episodes ?? null,
        dubConfidence: record?.dub?.confidence ?? null,
        dubReason: record?.dub?.reason ?? null,
        dubVerifiedAt: record?.dub?.lastVerifiedAt ?? null
      };
    });
  });
}
