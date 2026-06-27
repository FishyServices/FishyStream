import { useNavigate, useSearchParams } from "react-router-dom";
import { Tv2, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { EmptyState, FilterBar, GridSkeleton, PageHeader } from "@/components/UXPrimitives";
import { useAppSettings } from "@/hooks/useAppSettings";
import { usePaginatedContent, type ContentSort } from "@/hooks/useContent";
import { TV_SORT_OPTIONS } from "@/lib/appSettings";
import { parsePageParam, parseSortParam, updateBrowseParams } from "@/lib/browseNavigation";
import { createPlayHandler } from "@/lib/watchNavigation";
import { Button, Select, SelectContent, SelectItem, SelectTrigger } from "@fishy/ui";

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

  useSeoMeta({
    title: "TV Shows",
    description:
      "Browse and stream TV shows online on FishyStream. Find dramas, comedies, sci-fi, animation, and more.",
    path: "/tv-shows"
  });
  const genre = searchParams.get("genre") ?? "All";
  const page = parsePageParam(searchParams.get("page"));
  const sort = parseSortParam(searchParams.get("sort"), VALID_SORTS, settings.defaultTVSort);
  const sortLabel = TV_SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "Sort";
  const paginated = usePaginatedContent("tv", genre !== "All" ? genre : undefined, sort, 12, page);
  const shows = paginated.items;
  const handlePlay = createPlayHandler(navigate, "tv");

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="page-shell-wide page-stack">
        <PageHeader
          title="TV Shows"
          count={paginated.totalCount}
          actions={
            <Select
              value={sort}
              onValueChange={(value) => {
                if (!value) return;
                updateBrowseParams(setSearchParams, { sort: value, page: 1 });
              }}
            >
              <SelectTrigger className="flex items-center gap-2 rounded-lg border border-border bg-card/70 text-sm text-foreground/80">
                <Filter className="w-3.5 h-3.5 shrink-0" />
                <span>{sortLabel}</span>
              </SelectTrigger>
              <SelectContent>
                {TV_SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <FilterBar>
          <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-hide px-1">
            {GENRES.map((g) => (
              <Button
                key={g}
                variant={genre === g ? "default" : "outline"}
                size="sm"
                className="shrink-0 rounded-md"
                onClick={() => updateBrowseParams(setSearchParams, { genre: g, page: 1 })}
              >
                {g}
              </Button>
            ))}
          </div>
        </FilterBar>

        {paginated.isLoading ? (
          <GridSkeleton />
        ) : shows.length === 0 ? (
          <EmptyState icon={<Tv2 className="h-10 w-10" />} title="No shows" />
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
                onClick={() => updateBrowseParams(setSearchParams, { page: page - 1 })}
                disabled={!paginated.canGoBack}
                className="flex w-full items-center justify-center gap-2 rounded-md sm:w-auto"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Previous</span>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {paginated.currentPage}
                {paginated.totalPages ? ` of ${paginated.totalPages}` : ""}
              </span>
              <Button
                variant="outline"
                onClick={() => updateBrowseParams(setSearchParams, { page: page + 1 })}
                disabled={!paginated.hasNextPage}
                className="flex w-full items-center justify-center gap-2 rounded-md sm:w-auto"
                aria-label="Next page"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
