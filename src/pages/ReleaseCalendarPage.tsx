import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Check, ChevronDown, Languages, LoaderCircle, Search } from "lucide-react";
import { Button, Input } from "@fishy/ui";
import { Header } from "@/ui/components/Header";
import { EmptyState, PageHeader } from "@/ui/components/UXPrimitives";
import { useBookmarkPagination } from "@/features/library/useBookmark";
import { useContentDetail } from "@/features/catalog/queries/useContent";
import type { AniDubStatus } from "@fishy/providers/anime/anidub";
import type { BookmarkGridItem, ContentId } from "@content/contentMetadata";

type AnimeRelease = {
  episode: number;
  date: string;
  platform?: string | null;
  estimated?: boolean;
};
type AnimeTitleSchedule = {
  item: BookmarkGridItem;
  animeTitle: string;
  matched: boolean;
  sub: AnimeRelease[];
  dub: AnimeRelease[];
  dubProgress?: AniDubStatus | null;
  dubbedEpisodes?: number | null;
  totalEpisodes?: number | null;
  dubReason?: string | null;
};
type AnimeScheduleResponse = Omit<AnimeTitleSchedule, "item" | "animeTitle"> & {
  contentId: string;
  title: string;
};
type CalendarEvent = {
  title: string;
  episode: number;
  date: string;
  type: "SUB" | "DUB";
  estimated: boolean;
  platform?: string | null;
};
type ReleaseFilter = "all" | "sub" | "dub";

function dubProgress(anime: AnimeTitleSchedule) {
  const total = anime.totalEpisodes;
  const count = anime.dubbedEpisodes;
  if (typeof count === "number" && typeof total === "number") {
    return count >= total
      ? `Fully dubbed · ${total}/${total}`
      : `Partially dubbed · ${count}/${total}`;
  }
  if (anime.dubProgress === "in_production") return "Dub in production";
  if (anime.dubProgress === "announced") return "Dub announced";
  if (anime.dubProgress === "none") return "No dub reported";
  return anime.dubReason ?? "Dub progress not reported";
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKey(value: string) {
  return localDateKey(new Date(value));
}

function formatAirTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
    new Date(value)
  );
}

function calendarDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  const days: Date[] = [];
  for (
    const day = new Date(first);
    day <= end || days.length % 7 !== 0;
    day.setDate(day.getDate() + 1)
  ) {
    days.push(new Date(day));
  }
  return { today, days };
}

function AnimeReleaseCalendar({
  schedules,
  filter
}: {
  schedules: AnimeTitleSchedule[];
  filter: ReleaseFilter;
}) {
  const { today, days } = useMemo(calendarDays, []);
  const events = useMemo(
    () =>
      schedules
        .flatMap((schedule) => [
          ...(filter === "dub"
            ? []
            : schedule.sub.map((release) => ({
                title: schedule.animeTitle,
                episode: release.episode,
                date: release.date,
                type: "SUB" as const,
                estimated: !!release.estimated,
                platform: release.platform
              }))),
          ...(filter === "sub"
            ? []
            : schedule.dub.map((release) => ({
                title: schedule.animeTitle,
                episode: release.episode,
                date: release.date,
                type: "DUB" as const,
                estimated: !!release.estimated,
                platform: release.platform
              })))
        ])
        .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)),
    [filter, schedules]
  );
  const grouped = useMemo(() => {
    const result = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dateKey(event.date);
      result.set(key, [...(result.get(key) ?? []), event]);
    }
    return result;
  }, [events]);

  return (
    <div className="overflow-x-auto rounded-xl border border-border/65 bg-card/45">
      <div className="min-w-[46rem]">
        <div className="grid grid-cols-7 border-b border-border/65 bg-background/35">
          {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(
            (day) => (
              <div
                key={day}
                className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            )
          )}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = localDateKey(day);
            const releases = grouped.get(key) ?? [];
            const isPast = day < today;
            const isOutsideWindow = day.getTime() > today.getTime() + 30 * 86_400_000;
            const isToday = key === localDateKey(today);
            return (
              <div
                key={key}
                className={`min-h-28 border-b border-r border-border/45 p-1.5 ${isPast || isOutsideWindow ? "opacity-40" : ""}`}
              >
                <div
                  className={`mb-1 grid h-6 w-6 place-items-center rounded-full text-xs ${isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {day.getDate()}
                </div>
                <div className="space-y-1">
                  {releases.slice(0, 3).map((event, index) => (
                    <div
                      key={`${event.type}-${event.title}-${event.episode}-${index}`}
                      title={`${event.title} · Episode ${event.episode}`}
                      className={`rounded-md border px-1.5 py-1 text-[10px] leading-tight ${event.type === "DUB" ? "border-primary/35 bg-primary/10" : "border-sky-400/25 bg-sky-400/10"}`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="font-bold">{event.type}</span>
                        <span className="truncate text-muted-foreground">
                          {formatAirTime(event.date)}
                        </span>
                      </div>
                      <p className="truncate font-medium">{event.title}</p>
                      <p className="text-muted-foreground">
                        Episode {event.episode}
                        {event.estimated ? " · estimated" : ""}
                      </p>
                    </div>
                  ))}
                  {releases.length > 3 && (
                    <p className="px-1 text-[10px] text-muted-foreground">
                      +{releases.length - 3} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function UpcomingShowRelease({ item }: { item: BookmarkGridItem }) {
  const { detail, isLoading } = useContentDetail(item.tmdbId, "tv", true, false);
  const episode = detail?.nextEpisode;
  const isUpcoming = !!episode && new Date(`${episode.airDate}T23:59:59`) >= new Date();
  return (
    <article className="flex min-w-0 gap-3 rounded-xl border border-border/65 bg-card/55 p-3">
      <img src={item.posterUrl} alt="" className="h-16 w-11 rounded-md object-cover" />
      <div className="min-w-0 self-center">
        <h3 className="truncate text-sm font-semibold">{item.title}</h3>
        {isLoading ? (
          <p className="mt-1 text-xs text-muted-foreground">Checking next episode…</p>
        ) : isUpcoming && episode ? (
          <p className="mt-1 text-xs text-muted-foreground">
            S{episode.seasonNumber} E{episode.episodeNumber}: {episode.name}
            <span className="mt-0.5 block font-medium text-primary">{episode.airDate}</span>
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">No upcoming date listed.</p>
        )}
      </div>
    </article>
  );
}

export function ReleaseCalendarPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const { items, canLoadMore, isLoadingMore, loadMore } = useBookmarkPagination(
    undefined,
    searchQuery
  );
  const shows = useMemo(() => (items ?? []).filter((item) => item.type === "tv"), [items]);
  const [selectedIds, setSelectedIds] = useState<Set<ContentId>>(() => new Set());
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>("all");
  const [animeSchedules, setAnimeSchedules] = useState<AnimeTitleSchedule[]>([]);
  const [isLoadingAnime, setIsLoadingAnime] = useState(false);
  const [animeError, setAnimeError] = useState<string | null>(null);

  useEffect(() => {
    if (!items) return;
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const valid = new Set(items.map((item) => item._id));
      const next = new Set([...current].filter((id) => valid.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [items]);

  const selectedShows = useMemo(
    () => shows.filter((item) => selectedIds.has(item._id)),
    [selectedIds, shows]
  );
  const selectedSignature = selectedShows.map((item) => item._id).join(",");
  const filteredShows = shows;

  useEffect(() => {
    if (!selectedShows.length) {
      setAnimeSchedules([]);
      setIsLoadingAnime(false);
      setAnimeError(null);
      return;
    }
    let cancelled = false;
    setIsLoadingAnime(true);
    setAnimeError(null);
    void (async () => {
      try {
        const response = await fetch("/api/anime-release-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            selected: selectedShows.map((item) => ({ contentId: item._id, title: item.title }))
          })
        });
        const payload = (await response.json()) as AnimeTitleSchedule[] | { message?: string };
        if (!response.ok)
          throw new Error(
            "message" in payload ? payload.message : "Anime release data is unavailable."
          );
        if (cancelled) return;
        const bookmarkById = new Map(selectedShows.map((item) => [item._id, item]));
        setAnimeSchedules(
          (payload as AnimeScheduleResponse[])
            .map((entry) => ({
              item: bookmarkById.get(entry.contentId as ContentId)!,
              animeTitle: entry.title,
              matched: entry.matched,
              sub: entry.sub,
              dub: entry.dub,
              dubProgress: entry.dubProgress,
              dubbedEpisodes: entry.dubbedEpisodes,
              totalEpisodes: entry.totalEpisodes,
              dubReason: entry.dubReason
            }))
            .filter((entry) => !!entry.item)
        );
      } catch (error) {
        if (!cancelled)
          setAnimeError(
            error instanceof Error ? error.message : "Anime release data is unavailable."
          );
      } finally {
        if (!cancelled) setIsLoadingAnime(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedSignature]);

  const allSelected =
    filteredShows.length > 0 && filteredShows.every((item) => selectedIds.has(item._id));
  const toggleItem = (id: ContentId) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const matchedSchedules = animeSchedules.filter((schedule) => schedule.matched);
  const unmatchedSchedules = animeSchedules.filter((schedule) => !schedule.matched);
  const visibleEventCount = matchedSchedules.reduce(
    (total, schedule) =>
      total +
      (releaseFilter === "dub"
        ? schedule.dub.length
        : releaseFilter === "sub"
          ? schedule.sub.length
          : schedule.sub.length + schedule.dub.length),
    0
  );

  return (
    <div data-fishy-page="release-calendar" className="app-canvas min-h-screen">
      <Header />
      <main id="main-content" className="page-shell-wide page-stack pb-28">
        <PageHeader
          title="Release Calendar"
          actions={
            <Button
              variant="secondary"
              className="rounded-xl"
              onClick={() => navigate("/bookmark")}
            >
              Manage bookmarks
            </Button>
          }
        />
        <p className="-mt-5 max-w-2xl text-sm text-muted-foreground">
          See upcoming TV episodes and every scheduled anime SUB and DUB episode for the titles you
          follow.
        </p>

        {items === undefined ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/65 bg-card/55 p-6 text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading your bookmarks…
          </div>
        ) : shows.length === 0 && !searchQuery.trim() ? (
          <EmptyState
            title="No bookmarked shows yet"
            action={<Button onClick={() => navigate("/bookmark")}>Browse bookmarks</Button>}
          />
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.7fr)]">
            <section className="media-surface h-fit space-y-4 rounded-xl border-border/65 bg-card/55 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Your shows</h2>
                  <p className="text-sm text-muted-foreground">{selectedShows.length} selected</p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-lg"
                  onClick={() =>
                    setSelectedIds((current) => {
                      const next = new Set(current);
                      for (const item of filteredShows)
                        allSelected ? next.delete(item._id) : next.add(item._id);
                      return next;
                    })
                  }
                >
                  {allSelected ? "Clear results" : "Select results"}
                </Button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search bookmarked shows"
                  aria-label="Search bookmarked shows"
                  className="h-10 rounded-xl border-border/70 bg-background/60 pl-9"
                />
              </div>
              <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
                {filteredShows.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    No bookmarked titles match “{searchQuery}”.
                  </p>
                )}
                {filteredShows.map((item) => {
                  const selected = selectedIds.has(item._id);
                  return (
                    <Button
                      key={item._id}
                      type="button"
                      variant="ghost"
                      aria-pressed={selected}
                      onClick={() => toggleItem(item._id)}
                      className={`h-auto w-full justify-start gap-3 rounded-lg border p-2 text-left ${selected ? "border-primary/55 bg-primary/10" : "border-border/50 bg-background/25"}`}
                    >
                      <img
                        src={item.posterUrl}
                        alt=""
                        className="h-14 w-10 shrink-0 rounded object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"}`}
                      >
                        <Check className="h-4 w-4" />
                      </span>
                    </Button>
                  );
                })}
                {canLoadMore && (
                  <Button
                    variant="secondary"
                    className="w-full rounded-lg"
                    disabled={isLoadingMore}
                    onClick={() => loadMore()}
                  >
                    <ChevronDown className="mr-2 h-4 w-4" />
                    {isLoadingMore ? "Loading…" : "Load more bookmarks"}
                  </Button>
                )}
              </div>
            </section>

            <div className="min-w-0 space-y-8">
              <section className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    <div>
                      <h2 className="text-xl font-semibold">Next 31 days</h2>
                      <p className="text-sm text-muted-foreground">
                        {visibleEventCount} scheduled{" "}
                        {releaseFilter === "all"
                          ? "anime episodes"
                          : `${releaseFilter.toUpperCase()} episodes`}
                      </p>
                    </div>
                  </div>
                  <div
                    className="flex items-center gap-1 rounded-xl border border-border/65 bg-card/55 p-1"
                    aria-label="Filter calendar episodes"
                  >
                    {(
                      [
                        ["all", "All"],
                        ["sub", "SUB"],
                        ["dub", "DUB"]
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        size="sm"
                        variant={releaseFilter === value ? "secondary" : "ghost"}
                        aria-pressed={releaseFilter === value}
                        className="h-8 rounded-lg px-3"
                        onClick={() => setReleaseFilter(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
                {selectedShows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                    Choose bookmarked titles to fill the calendar.
                  </p>
                ) : isLoadingAnime ? (
                  <p className="flex items-center gap-2 rounded-xl border border-border/65 bg-card/45 p-6 text-sm text-muted-foreground">
                    <LoaderCircle className="h-4 w-4 animate-spin" /> Loading release dates…
                  </p>
                ) : animeError ? (
                  <p className="rounded-xl border border-border/65 bg-card/45 p-4 text-sm text-muted-foreground">
                    {animeError}
                  </p>
                ) : (
                  <>
                    {visibleEventCount === 0 ? (
                      <p className="rounded-lg border border-dashed border-border bg-background/25 p-3 text-sm text-muted-foreground">
                        No {releaseFilter === "all" ? "SUB or DUB" : releaseFilter.toUpperCase()}{" "}
                        episodes are scheduled in the next 31 days. This only means no dates are
                        listed; dub progress is shown below.
                      </p>
                    ) : null}
                    <AnimeReleaseCalendar schedules={matchedSchedules} filter={releaseFilter} />
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400" />
                        SUB
                      </span>
                      <span>
                        <span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />
                        DUB
                      </span>
                      <span>Times shown in your local timezone</span>
                    </div>
                    {matchedSchedules.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {matchedSchedules.map((schedule, index) => (
                          <article
                            key={`${schedule.item._id}-${schedule.animeTitle}-${index}`}
                            className="flex min-w-0 items-center gap-3 rounded-lg border border-border/55 bg-card/35 p-2.5"
                          >
                            <img
                              src={schedule.item.posterUrl}
                              alt=""
                              className="h-12 w-8 rounded object-cover"
                            />
                            <div className="min-w-0">
                              <h3 className="truncate text-sm font-medium">
                                {schedule.animeTitle}
                              </h3>
                              <p className="text-xs text-muted-foreground">
                                {dubProgress(schedule)}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                    {unmatchedSchedules.length > 0 && (
                      <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                        No anime schedule match for{" "}
                        {unmatchedSchedules.map((entry) => entry.item.title).join(", ")}. Try
                        selecting the specific season bookmark if available.
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Episode dates from{" "}
                      <a
                        className="underline underline-offset-2"
                        href="https://animeschedule.net"
                        target="_blank"
                        rel="noreferrer"
                      >
                        AnimeSchedule
                      </a>
                      . Dub progress from{" "}
                      <a
                        className="underline underline-offset-2"
                        href="https://anidub.moe"
                        target="_blank"
                        rel="noreferrer"
                      >
                        AniDub
                      </a>
                      .
                    </p>
                  </>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Languages className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="text-lg font-semibold">TV show premieres</h2>
                    <p className="text-sm text-muted-foreground">
                      Next upcoming episode listed by TMDB
                    </p>
                  </div>
                </div>
                {selectedShows.length ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {selectedShows.map((item) => (
                      <UpcomingShowRelease key={item._id} item={item} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select bookmarked shows to see upcoming TV dates.
                  </p>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
