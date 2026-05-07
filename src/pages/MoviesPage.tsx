import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, Film, Filter, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useAppSettings } from "@/hooks/useAppSettings";
import { usePaginatedContent, type ContentSort } from "@/hooks/useContent";
import { MOVIE_SORT_OPTIONS } from "@/lib/appSettings";
import { Button } from "@fishy/ui";

const GENRES = [
  "All",
  "Action",
  "Comedy",
  "Drama",
  "Horror",
  "Sci-Fi",
  "Thriller",
  "Animation",
  "Documentary",
  "Romance",
  "Fantasy",
  "Crime",
  "Adventure"
];
const VALID_SORTS = new Set<ContentSort>(MOVIE_SORT_OPTIONS.map((sort) => sort.value));

export function MoviesPage() {
  const navigate = useNavigate();
  const { settings } = useAppSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sortOpen, setSortOpen] = useState(false);
  const [pageHistory, setPageHistory] = useState<string[]>([]);

  const genre = searchParams.get("genre") ?? "All";
  const sortParam = searchParams.get("sort");
  const sort: ContentSort =
    sortParam && VALID_SORTS.has(sortParam as ContentSort)
      ? (sortParam as ContentSort)
      : settings.defaultMovieSort;
  const cursor = searchParams.get("cursor") ?? undefined;

  const paginated = usePaginatedContent(
    "movie",
    genre !== "All" ? genre : undefined,
    sort,
    cursor,
    24
  );

  const movies = paginated?.items;
  const hasNextPage = !!paginated?.nextCursor;
  const totalCount = paginated?.totalCount ?? 0;

  const currentPage = pageHistory.length + 1;
  const totalPages = Math.ceil(totalCount / 24);

  const currentSort =
    MOVIE_SORT_OPTIONS.find((s) => s.value === sort) ??
    MOVIE_SORT_OPTIONS.find((s) => s.value === settings.defaultMovieSort) ??
    MOVIE_SORT_OPTIONS[0]!;

  const handlePlay = (tmdbId: string) => navigate(`/watch/${tmdbId}`);

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
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-black text-foreground">Movies</h1>
            {movies && <p className="mt-1 text-sm text-muted-foreground">{totalCount} titles</p>}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 self-start">
            {/* Sort */}
            <div className="relative">
              <button
                className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-3 py-2 text-sm text-foreground/80 transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setSortOpen(!sortOpen)}
              >
                <Filter className="w-3.5 h-3.5" />
                {currentSort.label}
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${sortOpen ? "rotate-180" : ""}`}
                />
              </button>
              {sortOpen && (
                <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-border/80 bg-popover py-1 shadow-lg">
                  {MOVIE_SORT_OPTIONS.map((s) => (
                    <button
                      key={s.value}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-accent ${
                        s.value === sort ? "font-semibold text-primary" : "text-foreground/75"
                      }`}
                      onClick={() => {
                        setSearchParams((p) => {
                          p.set("sort", s.value);
                          p.delete("cursor");
                          return p;
                        });
                        setSortOpen(false);
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Genre pills */}
        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-4">
          {GENRES.map((g) => (
            <button
              key={g}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                genre === g
                  ? "bg-primary text-white"
                  : "border border-border bg-card/65 text-foreground/72 hover:border-primary/30 hover:text-foreground"
              }`}
              onClick={() => {
                setSearchParams((p) => {
                  g === "All" ? p.delete("genre") : p.set("genre", g);
                  p.delete("cursor");
                  return p;
                });
              }}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Grid */}
        {movies === undefined ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : movies.length === 0 ? (
          <div className="text-center py-16">
            <Film className="mx-auto mb-3 h-10 w-10 text-muted-foreground/35" />
            <p className="text-muted-foreground">No movies found</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {movies.map((movie) => (
                <MovieCard key={movie._id} content={movie} onPlay={handlePlay} layout="grid" />
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
