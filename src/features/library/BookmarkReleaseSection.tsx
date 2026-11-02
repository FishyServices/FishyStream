import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, ChevronDown, Info, LoaderCircle } from "lucide-react";
import { Button } from "@fishy/ui";
import type { AnimeReleaseScheduleEntry } from "@fishy/providers/anime";
import type { BookmarkGridItem } from "@content/contentMetadata";
import { useContentDetail } from "@/features/catalog/queries/useContent";
import { ContentModal } from "@/ui/components/ContentModal";
import type { PlayHandler } from "@/shared/navigation/watchNavigation";
import {
  getCachedAnimeReleaseSchedules,
  getCachedTvRelease,
  getUncachedAnimeReleaseIds,
  setCachedAnimeReleaseSchedules,
  setCachedTvRelease
} from "@/shared/storage/viewerStateStorage";

const MAX_ANIME_SCHEDULE_TITLES = 50;
const animeScheduleRequests = new Map<string, Promise<AnimeReleaseScheduleEntry[]>>();

function loadAnimeReleaseSchedules(
  selected: Array<{ contentId: string; title: string }>
): Promise<AnimeReleaseScheduleEntry[]> {
  const requestKey = selected
    .map(({ contentId, title }) => `${contentId}:${title}`)
    .sort()
    .join(",");
  const existing = animeScheduleRequests.get(requestKey);
  if (existing) return existing;

  const request = (async () => {
    const response = await fetch("/api/anime-release-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected })
    });
    const payload = (await response.json()) as AnimeReleaseScheduleEntry[] | { message?: string };
    if (!response.ok) {
      throw new Error(
        !Array.isArray(payload) && payload.message
          ? payload.message
          : "Anime release data is unavailable."
      );
    }
    if (!Array.isArray(payload)) throw new Error("Anime release data is unavailable.");
    setCachedAnimeReleaseSchedules(
      selected.map((item) => item.contentId),
      payload
    );
    return payload;
  })();
  animeScheduleRequests.set(requestKey, request);
  void request.finally(() => animeScheduleRequests.delete(requestKey)).catch(() => {});
  return request;
}

function ReleaseInfoCard({
  item,
  onPlay,
  children
}: {
  item: BookmarkGridItem;
  onPlay: PlayHandler;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        aria-haspopup="dialog"
        aria-label={`View info for ${item.title}`}
        disabled={!item.tmdbId}
        onClick={() => setIsOpen(true)}
        className="h-auto w-full min-w-0 justify-start gap-3 rounded-lg border border-border/55 bg-background/30 p-2.5 text-left hover:bg-accent/50"
      >
        <img src={item.posterUrl} alt="" className="h-14 w-10 shrink-0 rounded object-cover" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.title}</span>
          <span className="mt-0.5 block whitespace-normal font-normal">{children}</span>
        </span>
        <Info className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Button>
      <ContentModal
        content={item}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onPlay={onPlay}
      />
    </>
  );
}

function TvReleaseRow({
  item,
  animeEntries,
  onPlay
}: {
  item: BookmarkGridItem;
  animeEntries: AnimeReleaseScheduleEntry[];
  onPlay: PlayHandler;
}) {
  const [cached, setCached] = useState(() =>
    item.tmdbId ? getCachedTvRelease(item.tmdbId) : null
  );
  const { detail, isLoading, error } = useContentDetail(item.tmdbId, "tv", !cached, false);

  useEffect(() => {
    if (!item.tmdbId || isLoading || error || detail === undefined) return;
    const entry = { episode: detail?.nextEpisode ?? null, available: detail !== null };
    setCachedTvRelease(item.tmdbId, entry);
    setCached(entry);
  }, [detail, error, isLoading, item.tmdbId]);

  const episode = detail ? detail.nextEpisode : cached?.episode;
  const upcoming = episode && new Date(`${episode.airDate}T23:59:59`) >= new Date();
  const tvStatus =
    isLoading && !cached ? (
      <span className="text-xs text-muted-foreground">Checking next episode…</span>
    ) : error && !cached ? (
      <span className="text-xs text-muted-foreground">
        Could not check this show’s next episode.
      </span>
    ) : upcoming && episode ? (
      <span className="text-xs text-muted-foreground">
        Season {episode.seasonNumber}, episode {episode.episodeNumber}: {episode.name}
        <span className="block font-medium text-primary">{episode.airDate}</span>
        {error && <span className="block">Showing the saved date; refresh failed.</span>}
      </span>
    ) : error ? (
      <span className="text-xs text-muted-foreground">
        Could not refresh the saved TV release check.
      </span>
    ) : !item.tmdbId || detail === null || cached?.available === false ? (
      <span className="text-xs text-muted-foreground">
        TV release details are unavailable for this show.
      </span>
    ) : animeEntries.some((entry) => isAnimeCurrentlyOrPreviouslyAiring(entry.status)) ? null : (
      <span className="text-xs text-muted-foreground">No upcoming TV date listed.</span>
    );

  return (
    <ReleaseInfoCard item={item} onPlay={onPlay}>
      {tvStatus}
      {animeEntries.map((entry) => {
        const release = nextAnimeRelease(entry);
        const seasonStatus = release ? null : animeNoDateLabel(entry);
        if (!release && !seasonStatus) return null;
        return (
          <span
            key={`${entry.contentId}-${entry.title}`}
            className="mt-1 block text-xs text-muted-foreground"
          >
            {release
              ? `${seasonName(entry.title)}${release.type} · Episode ${release.episode} · ${release.estimated ? "Estimated · " : ""}${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(release.date))}`
              : seasonStatus}
          </span>
        );
      })}
    </ReleaseInfoCard>
  );
}

function nextAnimeRelease(entry: AnimeReleaseScheduleEntry) {
  return [
    ...entry.sub.map((release) => ({ ...release, type: "SUB" as const })),
    ...entry.dub.map((release) => ({ ...release, type: "DUB" as const }))
  ]
    .filter((release) => Date.parse(release.date) >= Date.now())
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date))[0];
}

function animeNoDateLabel(entry: AnimeReleaseScheduleEntry) {
  const title = entry.title;
  const season = seasonNumber(title);
  const prefix = season ? `Season ${season}` : null;
  switch (entry.status?.toLocaleLowerCase()) {
    case "finished":
      return prefix ? `${prefix} released` : null;
    case "ongoing":
      return prefix ? `${prefix} airing now` : "Currently airing";
    case "delayed":
      return prefix ? `${prefix} delayed` : "Release delayed";
    case "upcoming":
      return prefix ? `${prefix} confirmed · Date not announced` : "Confirmed · Date not announced";
    default:
      return prefix ? `${prefix} confirmed · Date not announced` : null;
  }
}

function seasonNumber(title: string) {
  const match = title.match(/\b(\d+)(?:st|nd|rd|th)?\s+season\b|\bseason\s+(\d+)\b|\bs(\d+)\b/i);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function seasonName(title: string) {
  const season = seasonNumber(title);
  return season ? `Season ${season} · ` : "";
}

function isAnimeCurrentlyOrPreviouslyAiring(status: string | null | undefined) {
  const normalized = status?.toLocaleLowerCase();
  return normalized === "finished" || normalized === "ongoing";
}

export function BookmarkReleaseSection({
  items,
  onPlay,
  canLoadMore,
  isLoadingMore,
  onLoadMore
}: {
  items: BookmarkGridItem[];
  onPlay: PlayHandler;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const shows = useMemo(() => items.filter((item) => item.type === "tv"), [items]);
  const selected = shows.slice(0, MAX_ANIME_SCHEDULE_TITLES).map((item) => ({
    contentId: item._id,
    title: item.title
  }));
  const selectedIds = selected.map((item) => item.contentId);
  const selectedSignature = selected.map((item) => `${item.contentId}:${item.title}`).join(",");
  const [schedules, setSchedules] = useState<AnimeReleaseScheduleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected.length) {
      setSchedules([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const cached = getCachedAnimeReleaseSchedules(selectedIds);
    const uncachedIds = [...new Set(getUncachedAnimeReleaseIds(selectedIds))];
    if (uncachedIds.length === 0) {
      setSchedules(cached);
      setIsLoading(false);
      setError(null);
      return;
    }
    setSchedules(cached);
    setIsLoading(true);
    setError(null);
    let cancelled = false;

    void (async () => {
      try {
        const missing = selected.filter((item) => uncachedIds.includes(item.contentId));
        const payload = await loadAnimeReleaseSchedules(missing);
        if (cancelled) return;
        setSchedules([...cached, ...payload]);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Anime release data is unavailable.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedSignature]);

  if (!shows.length) return null;

  const byContentId = new Map(shows.map((item) => [item._id, item]));
  const animeEntriesByContentId = new Map<string, AnimeReleaseScheduleEntry[]>();
  for (const entry of schedules) {
    if (!entry.matched || !byContentId.has(entry.contentId as BookmarkGridItem["_id"])) continue;
    const entries = animeEntriesByContentId.get(entry.contentId) ?? [];
    entries.push(entry);
    animeEntriesByContentId.set(entry.contentId, entries);
  }
  const upcomingAnimeCount = [...animeEntriesByContentId.values()]
    .flat()
    .filter((entry) => nextAnimeRelease(entry) !== undefined).length;

  return (
    <section className="media-surface space-y-4 rounded-xl border border-border/65 bg-card/55 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Coming up</h2>
          <p className="text-sm text-muted-foreground">
            Next anime episodes and TV show premieres for your saved shows
          </p>
        </div>
      </div>

      {isLoading && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Checking anime schedules…
        </p>
      )}
      {error && <p className="text-xs text-muted-foreground">{error}</p>}

      <div className="grid gap-2 md:grid-cols-2">
        {shows.map((item) => (
          <TvReleaseRow
            key={item._id}
            item={item}
            animeEntries={animeEntriesByContentId.get(item._id) ?? []}
            onPlay={onPlay}
          />
        ))}
      </div>

      {!isLoading && !error && upcomingAnimeCount === 0 && (
        <p className="text-xs text-muted-foreground">
          No upcoming anime episodes are listed. TV premiere dates are shown above.
        </p>
      )}
      {shows.length > MAX_ANIME_SCHEDULE_TITLES && (
        <p className="text-xs text-muted-foreground">
          Anime schedules check the first {MAX_ANIME_SCHEDULE_TITLES} saved shows.
        </p>
      )}
      {canLoadMore && (
        <Button
          variant="secondary"
          className="w-full rounded-lg"
          disabled={isLoadingMore}
          onClick={onLoadMore}
        >
          <ChevronDown className="mr-2 h-4 w-4" />
          {isLoadingMore ? "Loading…" : "Load more saved shows"}
        </Button>
      )}
    </section>
  );
}
