import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Film, Filter, Sparkles, Tv2 } from "lucide-react";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, FilterBar, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { useAppSettings } from "@/features/settings/useAppSettings";
import { usePaginatedContent, type ContentSort } from "@/features/catalog/queries/useContent";
import { ANIME_GENRES, MOVIE_GENRES, TV_GENRES } from "@/shared/config/mediaGenres";
import {
  parsePageParam,
  parseSortParam,
  updateBrowseParams
} from "@/shared/navigation/browseNavigation";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import { MOVIE_SORT_OPTIONS, TV_SORT_OPTIONS } from "@/shared/config/appSettings";
import { Button, Select, SelectContent, SelectItem, SelectTrigger } from "@fishy/ui";

export type MediaMode = "movie" | "tv" | "anime";

type GenreOption = {
  slug: string;
  label: string;
  query: string | null | undefined;
  href: string;
};

const VALID_MOVIE_SORTS = new Set<ContentSort>(MOVIE_SORT_OPTIONS.map((sort) => sort.value));
const VALID_TV_SORTS = new Set<ContentSort>(TV_SORT_OPTIONS.map((sort) => sort.value));

function genreOptions(mode: MediaMode): readonly GenreOption[] {
  if (mode === "anime") return ANIME_GENRES;
  return mode === "movie" ? MOVIE_GENRES : TV_GENRES;
}

function firstGenre(options: readonly GenreOption[]) {
  const first = options[0];
  if (!first) throw new Error("Media browse page requires at least one genre");
  return first;
}

function selectedMediaGenre(options: readonly GenreOption[], value: string | null) {
  return (
    options.find((genre) => genre.label === value || genre.query === value) ?? firstGenre(options)
  );
}

function mediaTitle(mode: MediaMode, genre: GenreOption) {
  if (genre.slug !== "all") return genre.label;
  return mode === "movie" ? "Movies" : mode === "tv" ? "TV Shows" : "All Anime";
}

export function MediaBrowsePage({ mode }: { mode: MediaMode }) {
  const navigate = useNavigate();
  const { genre: animeGenreSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useAppSettings();
  const options = genreOptions(mode);
  const selectedGenre =
    mode === "anime"
      ? (options.find((genre) => genre.slug === animeGenreSlug) ?? firstGenre(options))
      : selectedMediaGenre(options, searchParams.get("genre"));
  const sortOptions = mode === "movie" ? MOVIE_SORT_OPTIONS : TV_SORT_OPTIONS;
  const validSorts = mode === "movie" ? VALID_MOVIE_SORTS : VALID_TV_SORTS;
  const defaultSort = mode === "movie" ? settings.defaultMovieSort : settings.defaultTVSort;
  const page = parsePageParam(searchParams.get("page"));
  const sort = parseSortParam(searchParams.get("sort"), validSorts, defaultSort);
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Sort";
  const contentType = mode === "movie" ? "movie" : "tv";
  const paginated = usePaginatedContent(
    contentType,
    selectedGenre.query,
    sort,
    24,
    page,
    mode === "anime" ? "imdb" : "tmdb"
  );
  const handlePlay = createPlayHandler(navigate, contentType);
  const title = mediaTitle(mode, selectedGenre);

  useSeoMeta({
    title,
    description: `Browse and stream ${title.toLowerCase()} on FishyStream.`,
    path:
      mode === "anime"
        ? `/anime/genre/${selectedGenre.slug}`
        : mode === "movie"
          ? "/movies"
          : "/tv-shows"
  });

  const selectGenre = (genre: GenreOption) => {
    if (mode === "anime") {
      navigate(genre.href);
      return;
    }
    updateBrowseParams(setSearchParams, {
      genre: genre.slug === "all" ? "All" : genre.label,
      page: 1
    });
  };

  return (
    <div className="app-canvas min-h-screen">
      <Header />
      <main className="page-shell-wide page-stack">
        <PageHeader
          title={title}
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
                {sortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <FilterBar>
          <div className="media-surface -mx-1 flex gap-2 overflow-x-auto rounded-xl border-border/60 bg-card/48 p-2 scrollbar-hide">
            {options.map((genre) => (
              <Button
                key={genre.slug}
                variant={genre.slug === selectedGenre.slug ? "default" : "outline"}
                size="sm"
                className="shrink-0 rounded-xl"
                onClick={() => selectGenre(genre)}
              >
                {genre.label}
              </Button>
            ))}
          </div>
        </FilterBar>

        {paginated.isLoading ? (
          <GridSkeleton />
        ) : paginated.items.length === 0 ? (
          <EmptyState
            icon={
              mode === "movie" ? (
                <Film className="h-10 w-10" />
              ) : mode === "tv" ? (
                <Tv2 className="h-10 w-10" />
              ) : (
                <Sparkles className="h-10 w-10" />
              )
            }
            title={`No ${title.toLowerCase()} found`}
          />
        ) : (
          <>
            <div className="rounded-xl border border-border/55 bg-card/25 p-3 sm:p-5">
              <div className="mb-5 flex items-center gap-2">
                {mode === "movie" ? (
                  <Film className="h-4 w-4 text-primary" />
                ) : mode === "tv" ? (
                  <Tv2 className="h-4 w-4 text-primary" />
                ) : (
                  <Sparkles className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {paginated.items.map((item) => (
                  <MovieCard key={item._id} content={item} onPlay={handlePlay} layout="grid" />
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
