import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Tv2, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useAppSettings } from "@/hooks/useAppSettings";
import { usePaginatedContent, type ContentSort } from "@/hooks/useContent";
import { TV_SORT_OPTIONS } from "@/lib/appSettings";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@fishy/ui";

const GENRES = [
  "All",
  "Drama",
  "Action & Adventure",
  "Comedy",
  "Sci-Fi & Fantasy",
  "Animation",
  "Crime",
  "Documentary",
  "Reality",
  "Kids"
];
const VALID_SORTS = new Set<ContentSort>(TV_SORT_OPTIONS.map((sort) => sort.value));

export function TVShowsPage() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageHistory, setPageHistory] = useState<string[]>([]);

  const genre = searchParams.get("genre") ?? "All";
  const sortParam = searchParams.get("sort");
  const sort: ContentSort =
    sortParam && VALID_SORTS.has(sortParam as ContentSort)
      ? (sortParam as ContentSort)
      : settings.defaultTVSort;
  const cursor = searchParams.get("cursor") ?? undefined;

  const paginated = usePaginatedContent(
    "tv",
    genre !== "All" ? genre : undefined,
    sort,
    cursor,
    24
  );

  const shows = paginated?.items;
  const hasNextPage = !!paginated?.nextCursor;
  const totalCount = paginated?.totalCount ?? 0;

  const currentPage = pageHistory.length + 1;
  const totalPages = Math.ceil(totalCount / 24);

  const currentSort =
    TV_SORT_OPTIONS.find((s) => s.value === sort) ??
    TV_SORT_OPTIONS.find((s) => s.value === settings.defaultTVSort) ??
    TV_SORT_OPTIONS[0]!;
  const handlePlay = (tmdbId: string, season?: number, episode?: number) => {
    const p = new URLSearchParams();
    if (season) p.set("season", String(season));
    if (episode) p.set("episode", String(episode));
    navigate(`/watch/${tmdbId}${p.toString() ? "?" + p : ""}`);
  };

  const handleNext = () => {
    if (paginated?.nextCursor) {
      setPageHistory((prev) => [...prev, cursor ?? ""]);
      setSearchParams((p) => {
        p.set("cursor", paginated.nextCursor!);
        return p;
      });
    }
  };

  const handlePrevious = () => {
    if (pageHistory.length > 0) {
      const prevCursor = pageHistory[pageHistory.length - 1];
      setPageHistory((prev) => prev.slice(0, -1));
      setSearchParams((p) => {
        if (prevCursor) {
          p.set("cursor", prevCursor);
        } else {
          p.delete("cursor");
        }
        return p;
      });
    }
  };

  const canGoBack = pageHistory.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="page-stack px-4 sm:px-6 lg:px-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-black text-foreground">TV Shows</h1>
            {shows && <p className="mt-1 text-sm text-muted-foreground">{totalCount} titles</p>}
          </div>
          <div className="relative self-start">
            <Select
              value={sort}
              onValueChange={(value) => {
                if (!value) return;
                setSearchParams((p) => {
                  p.set("sort", value);
                  p.delete("cursor");
                  return p;
                });
              }}
            >
              <SelectTrigger className="flex items-center gap-2 rounded-lg border border-border bg-card/70 text-sm text-foreground/80">
                <Filter className="w-3.5 h-3.5 shrink-0" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {TV_SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-4">
          {GENRES.map((g) => (
            <Button
              key={g}
              variant={genre === g ? "default" : "outline"}
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() =>
                setSearchParams((p) => {
                  g === "All" ? p.delete("genre") : p.set("genre", g);
                  p.delete("cursor");
                  return p;
                })
              }
            >
              {g}
            </Button>
          ))}
        </div>

        {shows === undefined ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : shows.length === 0 ? (
          <div className="text-center py-16">
            <Tv2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground/35" />
            <p className="text-muted-foreground">No shows found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {shows.map((show) => (
                <MovieCard key={show._id} content={show} onPlay={handlePlay} layout="grid" />
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={!canGoBack}
                className="flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {currentPage}
                {totalPages > 0 ? ` of ${totalPages}` : ""}
              </span>
              <Button
                variant="outline"
                onClick={handleNext}
                disabled={!hasNextPage}
                className="flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
