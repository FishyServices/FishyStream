import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger } from "@fishy/ui";
import { useAppSettings } from "@/features/settings/useAppSettings";
import {
  usePaginatedContent,
  type AnimeMediaFilter,
  type AnimeSort,
  type ContentSort
} from "@/features/catalog/queries/useContent";
import { Header } from "@/ui/components/Header";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { MovieCard } from "@/ui/components/MovieCard";
import {
  ANIME_GENRES,
  JIKAN_ANIME_GENRES,
  KITSU_ANIME_GENRES,
  MOVIE_GENRES,
  TV_GENRES
} from "@/shared/config/mediaGenres";
import {
  parsePageParam,
  parseSortParam,
  updateBrowseParams
} from "@/shared/navigation/browseNavigation";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import { MOVIE_SORT_OPTIONS, TV_SORT_OPTIONS } from "@/shared/config/appSettings";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";

export type MediaMode = "movie" | "tv" | "anime";

const PAGE_SIZE = 24;
const ANILIST_MAX_BROWSE_PAGE = 50;
const BROWSE_GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8";

const ANIME_SORT_OPTIONS: Array<{ value: AnimeSort; label: string }> = [
  { value: "popular", label: "Popular" },
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "top-rated", label: "Top rated" }
];

type GenreOption = {
  slug: string;
  label: string;
  query: string | null | undefined;
  href: string;
};

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
    options.find(
      (genre) => genre.slug === value || genre.label === value || genre.query === value
    ) ?? firstGenre(options)
  );
}

function FilterSelect({
  label,
  value,
  options,
  onValueChange,
  className = ""
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="pl-1 text-xs font-medium text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={(next) => next && onValueChange(next)}>
        <SelectTrigger
          aria-label={label}
          className="min-h-11 w-full rounded-lg border-border/70 bg-background/70 text-sm text-foreground"
        >
          <span className="truncate">{selected?.label ?? label}</span>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ResultGrid({
  items,
  onPlay
}: {
  items: ReturnType<typeof usePaginatedContent>["items"];
  onPlay: ReturnType<typeof createPlayHandler>;
}) {
  return (
    <div className={BROWSE_GRID_CLASS}>
      {items.map((item) => (
        <MovieCard key={item._id} content={item} onPlay={onPlay} layout="grid" showBookmarkAction />
      ))}
    </div>
  );
}

function Pagination({
  page,
  currentPage,
  totalPages,
  canGoBack,
  hasNextPage,
  onPrevious,
  onNext
}: {
  page: number;
  currentPage: number;
  totalPages?: number;
  canGoBack: boolean;
  hasNextPage: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav
      className="mt-12 flex items-center justify-center gap-3 border-t border-border/50 pt-6"
      aria-label="Catalog pages"
    >
      <Button
        variant="outline"
        size="icon"
        className="min-h-11 min-w-11 rounded-lg"
        onClick={onPrevious}
        disabled={!canGoBack}
        aria-label="Previous page"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <p className="min-w-28 text-center text-sm text-muted-foreground" aria-live="polite">
        Page{" "}
        <span className="font-semibold tabular-nums text-foreground">{currentPage || page}</span>
        {totalPages ? ` of ${totalPages}` : ""}
      </p>
      <Button
        variant="outline"
        size="icon"
        className="min-h-11 min-w-11 rounded-lg"
        onClick={onNext}
        disabled={!hasNextPage}
        aria-label="Next page"
      >
        <ArrowRight className="h-4 w-4" />
      </Button>
    </nav>
  );
}

function StandardMediaBrowsePage({ mode }: { mode: Exclude<MediaMode, "anime"> }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useAppSettings();
  const options = genreOptions(mode);
  const selectedGenre = selectedMediaGenre(options, searchParams.get("genre"));
  const sortOptions = mode === "movie" ? MOVIE_SORT_OPTIONS : TV_SORT_OPTIONS;
  const validSorts =
    mode === "movie"
      ? new Set<ContentSort>(MOVIE_SORT_OPTIONS.map(({ value }) => value))
      : new Set<ContentSort>(TV_SORT_OPTIONS.map(({ value }) => value));
  const defaultSort = mode === "movie" ? settings.defaultMovieSort : settings.defaultTVSort;
  const sort = parseSortParam(searchParams.get("sort"), validSorts, defaultSort);
  const page = parsePageParam(searchParams.get("page"));
  const contentType = mode === "movie" ? "movie" : "tv";
  const paginated = usePaginatedContent(contentType, selectedGenre.query, sort, PAGE_SIZE, page);
  const handlePlay = createPlayHandler(navigate, contentType);
  const title = mode === "movie" ? "Movies" : "TV shows";

  useSeoMeta({
    title,
    description: `Browse and stream ${title.toLowerCase()} on FishyStream.`,
    path: mode === "movie" ? "/movies" : "/tv-shows"
  });

  const selectGenre = (slug: string) => {
    const genre = options.find((option) => option.slug === slug);
    if (genre)
      updateBrowseParams(setSearchParams, {
        genre: genre.slug === "all" ? "All" : genre.label,
        page: 1
      });
  };

  const clearGenre = () => updateBrowseParams(setSearchParams, { genre: "All", page: 1 });
  const sortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Popular";
  const selectedTitle = selectedGenre.slug === "all" ? title : selectedGenre.label;

  return (
    <div className="app-canvas min-h-screen text-foreground">
      <Header />
      <main id="main-content" className="page-shell-wide page-stack">
        <PageHeader title={title} count={paginated.totalCount} />

        <div
          className="mb-7 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
          aria-label="Catalog filters"
        >
          <FilterSelect
            label="Genre"
            value={selectedGenre.slug}
            options={options.map(({ slug, label }) => ({
              value: slug,
              label: label.replace("All Movies", "All genres").replace("All Shows", "All genres")
            }))}
            onValueChange={selectGenre}
          />
          <FilterSelect
            label="Sort by"
            value={sort}
            options={sortOptions}
            onValueChange={(value) => updateBrowseParams(setSearchParams, { sort: value, page: 1 })}
          />
        </div>

        <div className="mb-5 flex min-h-9 flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
          <h2 className="text-lg font-semibold text-foreground">{selectedTitle}</h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{sortLabel}</span>
            {selectedGenre.slug !== "all" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-md px-2 text-primary"
                onClick={clearGenre}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Clear genre
              </Button>
            ) : null}
          </div>
        </div>

        {paginated.isLoading ? (
          <GridSkeleton className={BROWSE_GRID_CLASS} />
        ) : paginated.items.length > 0 ? (
          <ResultGrid items={paginated.items} onPlay={handlePlay} />
        ) : (
          <EmptyState
            title={`No ${mode === "movie" ? "movies" : "shows"} found in ${selectedGenre.label.toLowerCase()}`}
            action={
              selectedGenre.slug !== "all" ? (
                <Button variant="outline" className="rounded-lg" onClick={clearGenre}>
                  Show all {title.toLowerCase()}
                </Button>
              ) : undefined
            }
          />
        )}

        {!paginated.isLoading && paginated.items.length > 0 ? (
          <Pagination
            page={page}
            currentPage={paginated.currentPage}
            totalPages={paginated.totalPages}
            canGoBack={paginated.canGoBack}
            hasNextPage={paginated.hasNextPage}
            onPrevious={() => updateBrowseParams(setSearchParams, { page: page - 1 })}
            onNext={() => updateBrowseParams(setSearchParams, { page: page + 1 })}
          />
        ) : null}
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

function parseAnimeBackend(value: string | null): "anilist" | "jikan" | "kitsu" {
  return value === "anilist" || value === "jikan" ? value : "kitsu";
}

function isAnimeSort(value: string | null | undefined): value is AnimeSort {
  return value === "popular" || value === "newest" || value === "oldest" || value === "top-rated";
}

function AnimeMediaBrowsePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const backend = parseAnimeBackend(searchParams.get("backend"));
  const genres =
    backend === "jikan"
      ? JIKAN_ANIME_GENRES
      : backend === "kitsu"
        ? KITSU_ANIME_GENRES
        : ANIME_GENRES;
  const selectedGenre = selectedMediaGenre(genres, searchParams.get("genre"));
  const media = parseAnimeMedia(searchParams.get("media"));
  const adult = searchParams.get("adult") === "1";
  const sort = parseAnimeSort(searchParams.get("sort"));
  const requestedPage = parsePageParam(searchParams.get("page"));
  const page =
    backend === "anilist" ? Math.min(requestedPage, ANILIST_MAX_BROWSE_PAGE) : requestedPage;
  const pageSize = backend === "kitsu" ? 40 : backend === "jikan" ? 25 : PAGE_SIZE;
  const paginated = usePaginatedContent(
    "tv",
    selectedGenre.slug === "all" ? undefined : selectedGenre.slug,
    sort,
    pageSize,
    page,
    "anime",
    media,
    backend,
    adult
  );
  const handlePlay = createPlayHandler(navigate);

  useSeoMeta({
    title: "Anime",
    description: "Browse anime movies and TV shows on FishyStream.",
    path: "/anime"
  });

  const updateFilters = (
    updates: Partial<{
      media: AnimeMediaFilter;
      sort: AnimeSort;
      backend: "anilist" | "jikan" | "kitsu";
      adult: boolean;
      genre: string | null;
      page: number;
    }>
  ) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (updates.media) next.set("media", updates.media);
      if (updates.sort) next.set("sort", updates.sort);
      if (updates.backend) next.set("backend", updates.backend);
      if (updates.adult !== undefined) {
        if (updates.adult) next.set("adult", "1");
        else next.delete("adult");
      }
      if (updates.genre !== undefined) {
        if (updates.genre) next.set("genre", updates.genre);
        else next.delete("genre");
      }
      if (updates.page !== undefined) {
        if (updates.page <= 1) next.delete("page");
        else next.set("page", String(updates.page));
      }
      return next;
    });
  };

  const filterOptions = genres.map(({ slug, label }) => ({
    value: slug,
    label: label === "All Anime" ? "All genres" : label
  }));

  return (
    <div className="app-canvas min-h-screen text-foreground">
      <Header />
      <main id="main-content" className="page-shell-wide page-stack">
        <PageHeader title="Anime" count={paginated.totalCount} />

        <div className="mb-6 flex flex-wrap items-end gap-x-6 gap-y-4" aria-label="Anime filters">
          <div className="grid w-full max-w-lg grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <FilterSelect
              label="Genre"
              value={selectedGenre.slug}
              options={filterOptions}
              onValueChange={(value) =>
                updateFilters({ genre: value === "all" ? null : value, page: 1 })
              }
            />
            <FilterSelect
              label="Sort by"
              value={sort}
              options={ANIME_SORT_OPTIONS}
              onValueChange={(value) => {
                if (isAnimeSort(value)) updateFilters({ sort: value, page: 1 });
              }}
            />
          </div>

          <div className="space-y-1.5">
            <p className="pl-1 text-xs font-medium text-muted-foreground">Format</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Anime format">
              {(
                [
                  ["all", "All formats"],
                  ["movie", "Movies"],
                  ["tv", "Series"]
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  variant={media === value ? "default" : "outline"}
                  aria-pressed={media === value}
                  className="min-h-9 rounded-lg px-3"
                  onClick={() => updateFilters({ media: value, page: 1 })}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="pl-1 text-xs font-medium text-muted-foreground">Catalog</p>
            <div className="flex gap-2" role="group" aria-label="Anime catalog source">
              {(
                [
                  ["kitsu", "Kitsu"],
                  ["anilist", "AniList"],
                  ["jikan", "Jikan"]
                ] as const
              ).map(([value, label]) => (
                <Button
                  key={value}
                  variant={backend === value ? "default" : "outline"}
                  aria-pressed={backend === value}
                  className="min-h-9 rounded-lg px-3"
                  onClick={() => {
                    const nextGenres =
                      value === "jikan"
                        ? JIKAN_ANIME_GENRES
                        : value === "kitsu"
                          ? KITSU_ANIME_GENRES
                          : ANIME_GENRES;
                    updateFilters({
                      backend: value,
                      page: 1,
                      ...(nextGenres.some((genre) => genre.slug === selectedGenre.slug)
                        ? {}
                        : { genre: null })
                    });
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="pl-1 text-xs font-medium text-muted-foreground">Rating</p>
            <div className="flex gap-2" role="group" aria-label="Anime content rating">
              <Button
                variant={!adult ? "default" : "outline"}
                aria-pressed={!adult}
                className="min-h-9 rounded-lg px-3"
                onClick={() => updateFilters({ adult: false, page: 1 })}
              >
                General
              </Button>
              <Button
                variant={adult ? "destructive" : "outline"}
                aria-pressed={adult}
                className="min-h-9 rounded-lg px-3"
                onClick={() => updateFilters({ adult: true, page: 1 })}
              >
                18+
              </Button>
            </div>
          </div>
        </div>

        <div className="mb-5 flex min-h-9 flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
          <h2 className="text-lg font-semibold text-foreground">
            {selectedGenre.slug === "all" ? "All anime" : selectedGenre.label}
            {media !== "all" ? ` · ${media === "movie" ? "Movies" : "Series"}` : ""}
          </h2>
          <p className="text-sm text-muted-foreground">
            {ANIME_SORT_OPTIONS.find((option) => option.value === sort)?.label} ·{" "}
            {backend === "anilist" ? "AniList" : backend === "jikan" ? "Jikan" : "Kitsu"}
            {adult ? " · 18+" : ""}
          </p>
        </div>

        {paginated.isLoading ? (
          <GridSkeleton className={BROWSE_GRID_CLASS} />
        ) : paginated.items.length > 0 ? (
          <ResultGrid items={paginated.items} onPlay={handlePlay} />
        ) : (
          <EmptyState
            title="No anime found with these filters"
            action={
              selectedGenre.slug !== "all" || adult || media !== "all" ? (
                <Button
                  variant="outline"
                  className="rounded-lg"
                  onClick={() =>
                    updateFilters({ genre: null, adult: false, media: "all", page: 1 })
                  }
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        )}

        {!paginated.isLoading && paginated.items.length > 0 ? (
          <Pagination
            page={page}
            currentPage={paginated.currentPage}
            totalPages={paginated.totalPages}
            canGoBack={paginated.canGoBack}
            hasNextPage={paginated.hasNextPage}
            onPrevious={() => updateFilters({ page: page - 1 })}
            onNext={() => updateFilters({ page: page + 1 })}
          />
        ) : null}
      </main>
    </div>
  );
}

export function MediaBrowsePage({ mode }: { mode: MediaMode }) {
  return mode === "anime" ? <AnimeMediaBrowsePage /> : <StandardMediaBrowsePage mode={mode} />;
}
