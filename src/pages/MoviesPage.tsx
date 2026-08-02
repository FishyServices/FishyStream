import { useNavigate, useSearchParams } from "react-router-dom";
import { Film, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, FilterBar, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { useAppSettings } from "@/features/settings/useAppSettings";
import { usePaginatedContent, type ContentSort } from "@/features/catalog/queries/useContent";
import { MOVIE_SORT_OPTIONS } from "@/shared/config/appSettings";
import {
  parsePageParam,
  parseSortParam,
  updateBrowseParams
} from "@/shared/navigation/browseNavigation";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import { Button, Select, SelectContent, SelectItem, SelectTrigger } from "@fishy/ui";

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

  useSeoMeta({
    title: "Movies",
    description:
      "Browse and stream movies online on FishyStream. Find action, comedy, drama, horror, sci-fi, and more.",
    path: "/movies"
  });
  const genre = searchParams.get("genre") ?? "All";
  const page = parsePageParam(searchParams.get("page"));
  const sort = parseSortParam(searchParams.get("sort"), VALID_SORTS, settings.defaultMovieSort);
  const sortLabel = MOVIE_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Sort";
  const paginated = usePaginatedContent(
    "movie",
    genre !== "All" ? genre : undefined,
    sort,
    12,
    page
  );
  const movies = paginated.items;

  const handlePlay = createPlayHandler(navigate, "movie");

  return (
    <div className="app-canvas min-h-screen">
      <Header />
      <main className="page-shell-wide page-stack">
        <PageHeader
          title="Movies"
          count={paginated.totalCount}
          actions={
            <Select
              value={sort}
              onValueChange={(value) => {
                if (!value) return;
                updateBrowseParams(setSearchParams, { sort: value, page: 1 });
              }}
            >
              <SelectTrigger className="flex items-center gap-2 rounded-xl border-border/70 bg-card/70 text-sm text-foreground">
                <Filter className="h-3.5 w-3.5 shrink-0" />
                <span>{sortLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {MOVIE_SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <FilterBar>
          <div className="media-surface -mx-1 flex gap-2 overflow-x-auto rounded-xl border-border/60 bg-card/48 p-2 scrollbar-hide">
            {GENRES.map((g) => (
              <Button
                key={g}
                variant={genre === g ? "default" : "outline"}
                size="sm"
                className="shrink-0 rounded-xl"
                onClick={() => updateBrowseParams(setSearchParams, { genre: g, page: 1 })}
              >
                {g}
              </Button>
            ))}
          </div>
        </FilterBar>

        {paginated.isLoading ? (
          <GridSkeleton />
        ) : movies.length === 0 ? (
          <EmptyState icon={<Film className="h-10 w-10" />} title="No movies match this filter" />
        ) : (
          <>
            <div className="rounded-xl border border-border/55 bg-card/25 p-3 sm:p-5">
              <div className="mb-5 flex items-center gap-2">
                <Film className="h-4 w-4 text-primary" />
                <p className="text-sm text-muted-foreground">
                  {genre === "All"
                    ? "Explore the complete movie library"
                    : `${genre} movies, sorted by ${sortLabel.toLowerCase()}`}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {movies.map((movie) => (
                  <MovieCard key={movie._id} content={movie} onPlay={handlePlay} layout="grid" />
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => updateBrowseParams(setSearchParams, { page: page - 1 })}
                disabled={!paginated.canGoBack}
                className="rounded-xl"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {paginated.currentPage}
                {paginated.totalPages ? ` / ${paginated.totalPages}` : ""}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => updateBrowseParams(setSearchParams, { page: page + 1 })}
                disabled={!paginated.hasNextPage}
                className="rounded-xl"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
