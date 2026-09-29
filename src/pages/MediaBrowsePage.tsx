import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, FilterBar, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { useAppSettings } from "@/features/settings/useAppSettings";
import {
  usePaginatedContent,
  type AnimeMediaFilter,
  type AnimeSort,
  type ContentSort
} from "@/features/catalog/queries/useContent";
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

const ANIME_MEDIA_OPTIONS: Array<{ value: AnimeMediaFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV Shows" }
];

const ANIME_SORT_OPTIONS: Array<{ value: AnimeSort; label: string }> = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "top-rated", label: "Top Rated" }
];

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

function StandardMediaBrowsePage({ mode }: { mode: Exclude<MediaMode, "anime"> }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useAppSettings();
  const options = genreOptions(mode);
  const selectedGenre = selectedMediaGenre(options, searchParams.get("genre"));
  const sortOptions = mode === "movie" ? MOVIE_SORT_OPTIONS : TV_SORT_OPTIONS;
  const validSorts = mode === "movie" ? VALID_MOVIE_SORTS : VALID_TV_SORTS;
  const defaultSort = mode === "movie" ? settings.defaultMovieSort : settings.defaultTVSort;
  const page = parsePageParam(searchParams.get("page"));
  const sort = parseSortParam(searchParams.get("sort"), validSorts, defaultSort);
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Sort";
  const contentType = mode === "movie" ? "movie" : "tv";
  const paginated = usePaginatedContent(contentType, selectedGenre.query, sort, 24, page, "tmdb");
  const handlePlay = createPlayHandler(navigate, contentType);
  const title = mediaTitle(mode, selectedGenre);

  useSeoMeta({
    title,
    description: `Browse and stream ${title.toLowerCase()} on FishyStream.`,
    path: mode === "movie" ? "/movies" : "/tv-shows"
  });

  const selectGenre = (genre: GenreOption) => {
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
          <div className="media-surface -mx-1 flex gap-2 overflow-x-auto rounded-lg border-border/60 bg-card/48 p-2 scrollbar-hide">
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
          <EmptyState title={`No ${title.toLowerCase()} found`} />
        ) : (
          <>
            <div className="media-surface rounded-xl border-border/55 bg-card/38 p-3 sm:p-5">
              <div className="mb-5 flex items-center gap-2"></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {paginated.items.map((item) => (
                  <MovieCard
                    key={item._id}
                    content={item}
                    onPlay={handlePlay}
                    layout="grid"
                    showBookmarkAction
                  />
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

function parseAnimeMedia(value: string | null): AnimeMediaFilter {
  return value === "movie" || value === "tv" ? value : "all";
}

function parseAnimeSort(value: string | null): AnimeSort {
  return value === "newest" || value === "oldest" || value === "top-rated" ? value : "popular";
}

function isAnimeSort(value: string | null | undefined): value is AnimeSort {
  return value === "popular" || value === "newest" || value === "oldest" || value === "top-rated";
}

function AnimeMediaBrowsePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedGenre = selectedMediaGenre(ANIME_GENRES, searchParams.get("genre"));
  const media = parseAnimeMedia(searchParams.get("media"));
  const sort = parseAnimeSort(searchParams.get("sort"));
  const page = parsePageParam(searchParams.get("page"));
  const paginated = usePaginatedContent(
    "tv",
    selectedGenre.slug === "all" ? undefined : selectedGenre.slug,
    sort,
    32,
    page,
    "anime",
    media
  );
  const handlePlay = createPlayHandler(navigate);

  useSeoMeta({
    title: "Anime",
    description: "Browse anime movies and TV shows on FishyStream.",
    path: "/anime"
  });

  const updateFilters = (next: Partial<{ media: AnimeMediaFilter; sort: AnimeSort }>) => {
    const params = new URLSearchParams(searchParams);
    if (next.media) params.set("media", next.media);
    if (next.sort) params.set("sort", next.sort);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="app-canvas min-h-screen">
      <Header />
      <main className="page-shell-wide page-stack">
        <PageHeader
          title="Anime"
          count={paginated.totalCount}
          actions={
            <Select
              value={sort}
              onValueChange={(value) => {
                if (isAnimeSort(value)) updateFilters({ sort: value });
              }}
            >
              <SelectTrigger className="rounded-xl border-border/70 bg-card/70 text-sm text-foreground">
                {ANIME_SORT_OPTIONS.find((option) => option.value === sort)?.label}
              </SelectTrigger>
              <SelectContent>
                {ANIME_SORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {ANIME_MEDIA_OPTIONS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={media === option.value ? "default" : "outline"}
              className="shrink-0 rounded-full"
              onClick={() => updateFilters({ media: option.value })}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="media-surface -mx-1 flex gap-2 overflow-x-auto rounded-lg border-border/60 bg-card/48 p-2 scrollbar-hide">
          {ANIME_GENRES.map((genre) => (
            <Button
              key={genre.slug}
              size="sm"
              variant={genre.slug === selectedGenre.slug ? "default" : "outline"}
              className="shrink-0 rounded-full"
              onClick={() => navigate(genre.href)}
            >
              {genre.label.replace("All Anime", "All")}
            </Button>
          ))}
        </div>

        {paginated.isLoading ? (
          <GridSkeleton />
        ) : paginated.items.length === 0 ? (
          <EmptyState title="No anime found" />
        ) : (
          <>
            <div className="media-surface rounded-xl border-border/55 bg-card/38 p-3 sm:p-5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                {paginated.items.map((item) => (
                  <MovieCard
                    key={item._id}
                    content={item}
                    onPlay={handlePlay}
                    layout="grid"
                    showBookmarkAction={false}
                  />
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

export function MediaBrowsePage({ mode }: { mode: MediaMode }) {
  return mode === "anime" ? <AnimeMediaBrowsePage /> : <StandardMediaBrowsePage mode={mode} />;
}
