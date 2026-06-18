import { useNavigate, useSearch } from "@tanstack/react-router";
import { Loader2, Film, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useAppSettings } from "@/hooks/useAppSettings";
import { usePaginatedContent, type ContentSort } from "@/hooks/useContent";
import { MOVIE_SORT_OPTIONS } from "@/lib/appSettings";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@fishy/ui";

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
  const search = useSearch({ from: "/movies" });
  const genre = search.genre ?? "All";
  const page = search.page ?? 1;
  const sortParam = search.sort;
  const sort: ContentSort =
    sortParam && VALID_SORTS.has(sortParam as ContentSort)
      ? (sortParam as ContentSort)
      : settings.defaultMovieSort;
  const paginated = usePaginatedContent(
    "movie",
    genre !== "All" ? genre : undefined,
    sort,
    12,
    page
  );
  const movies = paginated.items;

  const handlePlay = (tmdbId: string) =>
    navigate({
      to: "/watch/$id",
      params: { id: tmdbId },
      search: { type: "movie" }
    });

  const updateBrowseParams = (updates: { sort?: string; genre?: string; page?: number }) => {
    navigate({
      to: "/movies",
      search: (prev: any) => {
        const next = { ...prev };
        if (updates.sort !== undefined) {
          next.sort = updates.sort;
        }
        if (updates.genre !== undefined) {
          if (updates.genre === "All") {
            delete next.genre;
          } else {
            next.genre = updates.genre;
          }
        }
        if (updates.page !== undefined) {
          if (updates.page <= 1) {
            delete next.page;
          } else {
            next.page = updates.page;
          }
        }
        return next;
      }
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="page-stack px-4 sm:px-6 lg:px-10">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-3xl font-black text-foreground">Movies</h1>
            {paginated.totalCount !== undefined && (
              <p className="mt-1 text-sm text-muted-foreground">{paginated.totalCount} titles</p>
            )}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 self-start">
            {/* Sort */}
            <Select
              value={sort}
              onValueChange={(value) => {
                if (!value) return;
                updateBrowseParams({ sort: value, page: 1 });
              }}
            >
              <SelectTrigger className="flex items-center gap-2 rounded-lg border border-border bg-card/70 text-sm text-foreground/80">
                <Filter className="w-3.5 h-3.5 shrink-0" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                {MOVIE_SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Genre pills */}
        <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto scrollbar-hide px-1 pb-4">
          {GENRES.map((g) => (
            <Button
              key={g}
              variant={genre === g ? "default" : "outline"}
              size="sm"
              className="shrink-0 rounded-full"
              onClick={() => updateBrowseParams({ genre: g, page: 1 })}
            >
              {g}
            </Button>
          ))}
        </div>

        {/* Grid */}
        {paginated.isLoading ? (
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
                onClick={() => updateBrowseParams({ page: page - 1 })}
                disabled={!paginated.canGoBack}
                className="flex w-full items-center justify-center gap-2 sm:w-auto"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {paginated.currentPage}
                {paginated.totalPages ? ` of ${paginated.totalPages}` : ""}
              </span>
              <Button
                variant="outline"
                onClick={() => updateBrowseParams({ page: page + 1 })}
                disabled={!paginated.hasNextPage}
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
