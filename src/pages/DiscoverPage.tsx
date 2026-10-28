import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Film, Info, Play, Search, Sparkles, Tv } from "lucide-react";
import { Button, Select, SelectContent, SelectItem, SelectTrigger } from "@fishy/ui";
import type { ContentCard, ContentFeatured } from "@content/contentMetadata";
import { useHomepageContent, usePaginatedContent } from "@/features/catalog/queries/useContent";
import { Header } from "@/ui/components/Header";
import { EmptyState, GridSkeleton } from "@/ui/components/UXPrimitives";
import { MovieCard } from "@/ui/components/MovieCard";
import { ANIME_GENRES, MOVIE_GENRES, TV_GENRES } from "@/shared/config/mediaGenres";
import { parsePageParam } from "@/shared/navigation/browseNavigation";
import { createPlayHandler, type PlayHandler } from "@/shared/navigation/watchNavigation";

type DiscoverTab = "movies" | "tv" | "anime";

const tabs: Array<{ value: DiscoverTab; label: string; icon: typeof Film }> = [
  { value: "movies", label: "Movies", icon: Film },
  { value: "tv", label: "TV shows", icon: Tv },
  { value: "anime", label: "Anime", icon: Sparkles }
];

const DISCOVER_PAGE_SIZE = 24;
const DISCOVER_GRID_CLASS =
  "grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8";

function parseTab(value: string | null): DiscoverTab {
  if (value === "movies" || value === "tv" || value === "anime") return value;
  return "movies";
}

function FeaturedDiscoverCarousel({
  items,
  onPlay,
  onDetails
}: {
  items: ContentFeatured[];
  onPlay: PlayHandler;
  onDetails: (item: ContentFeatured) => void;
}) {
  const [index, setIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const active = items[index];

  if (!active) {
    return (
      <section className="border-b border-border/60 bg-card/25">
        <div className="page-shell-wide grid min-h-72 items-center gap-6 py-12 sm:grid-cols-[1fr_auto] sm:py-16">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-medium text-primary">The screening room</p>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
              What sounds good tonight?
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              Browse movies, shows, and anime in one place.
            </p>
          </div>
          <Button asChild className="w-fit rounded-lg">
            <Link to="/search">
              <Search className="mr-2 h-4 w-4" />
              Search titles
            </Link>
          </Button>
        </div>
      </section>
    );
  }

  const move = (direction: -1 | 1) => {
    setImageFailed(false);
    setIndex((current) => (current + direction + items.length) % items.length);
  };

  const playActive = () => {
    if (!active.tmdbId) return;
    onPlay(
      active.tmdbId,
      active.type === "tv" ? 1 : undefined,
      active.type === "tv" ? 1 : undefined,
      undefined,
      undefined,
      active.type
    );
  };

  return (
    <section
      aria-label="Featured titles"
      aria-roledescription="carousel"
      className="relative isolate overflow-hidden border-b border-border/55 bg-card"
    >
      {!imageFailed && (active.backdropUrl || active.posterUrl) ? (
        <img
          key={active._id}
          src={active.backdropUrl || active.posterUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          fetchPriority="high"
          onError={() => setImageFailed(true)}
        />
      ) : null}
      <div className="absolute inset-0 -z-0 bg-linear-to-r from-background via-background/88 to-background/35 lg:via-background/72" />
      <div className="absolute inset-0 -z-0 bg-linear-to-t from-background via-background/20 to-transparent" />

      <div className="page-shell-wide relative z-10 grid min-h-[32rem] items-end gap-8 pb-8 pt-28 sm:min-h-[36rem] sm:pb-10 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-center lg:py-24">
        <div className="max-w-2xl space-y-5 pb-2 sm:space-y-6">
          <p className="text-sm font-semibold text-primary">Tonight’s feature</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium text-foreground/80">
            <span>{active.type === "tv" ? "TV series" : "Movie"}</span>
            {active.year ? <span>{active.year}</span> : null}
            {active.voteAverage ? (
              <span className="text-primary">★ {active.voteAverage.toFixed(1)}</span>
            ) : null}
            {active.seasons ? <span>{active.seasons} seasons</span> : null}
            {active.rating ? (
              <span className="rounded border border-foreground/30 px-1.5 py-0.5 text-xs">
                {active.rating}
              </span>
            ) : null}
          </div>

          {active.logoUrl && !imageFailed ? (
            <img
              src={active.logoUrl}
              alt={active.title}
              className="max-h-24 max-w-[min(27rem,82vw)] object-contain object-left sm:max-h-32"
            />
          ) : (
            <h1 className="max-w-xl text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-6xl">
              {active.title}
            </h1>
          )}

          {active.description ? (
            <p className="line-clamp-3 max-w-xl text-base leading-7 text-foreground/80">
              {active.description}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-11 rounded-lg px-5"
              onClick={playActive}
              disabled={!active.tmdbId}
            >
              <Play className="mr-2 h-4 w-4 fill-current" />
              Play
            </Button>
            <Button
              variant="secondary"
              className="min-h-11 rounded-lg border-border/70 bg-card/80 text-foreground hover:bg-accent"
              onClick={() => onDetails(active)}
            >
              <Info className="mr-2 h-4 w-4" />
              Details
            </Button>
          </div>
        </div>

        {items.length > 1 ? (
          <div className="hidden space-y-2 lg:block">
            <p className="px-1 pb-1 text-sm font-medium text-foreground/75">In the program</p>
            {items.map((item, itemIndex) => (
              <Button
                key={item._id}
                variant="ghost"
                aria-pressed={itemIndex === index}
                className={`h-auto min-h-16 w-full justify-start gap-3 rounded-lg border px-2 py-2 text-left ${itemIndex === index ? "border-primary/55 bg-card/85 text-foreground" : "border-transparent bg-background/55 text-foreground/75 hover:border-border/70 hover:bg-background/80 hover:text-foreground"}`}
                onClick={() => {
                  setImageFailed(false);
                  setIndex(itemIndex);
                }}
              >
                {item.posterUrl ? (
                  <img
                    src={item.posterUrl}
                    alt=""
                    className="h-12 w-9 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="grid h-12 w-9 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
                    <Film className="h-4 w-4" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {[item.type === "tv" ? "Series" : "Film", item.year]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      {items.length > 1 ? (
        <div className="relative z-10 border-t border-border/40 bg-background/35 lg:hidden">
          <div className="page-shell-wide flex snap-x gap-2 overflow-x-auto py-3">
            {items.map((item, itemIndex) => (
              <Button
                key={item._id}
                variant="ghost"
                aria-pressed={itemIndex === index}
                className={`h-10 min-h-10 shrink-0 rounded-md px-3 text-sm ${itemIndex === index ? "bg-primary/15 text-primary" : "text-foreground/70"}`}
                onClick={() => {
                  setImageFailed(false);
                  setIndex(itemIndex);
                }}
              >
                {item.title}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function DiscoverContentMode({ onPlay }: { onPlay: PlayHandler }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const genres = tab === "anime" ? ANIME_GENRES : tab === "tv" ? TV_GENRES : MOVIE_GENRES;
  const selectedGenre =
    genres.find((genre) => genre.slug === searchParams.get("genre")) ?? genres[0]!;
  const page = parsePageParam(searchParams.get("page"));
  const contentType = tab === "tv" ? "tv" : "movie";
  const paginated = usePaginatedContent(
    contentType,
    tab === "anime"
      ? selectedGenre.slug === "all"
        ? undefined
        : selectedGenre.slug
      : selectedGenre.query,
    "popular",
    DISCOVER_PAGE_SIZE,
    page,
    tab === "anime" ? "anime" : "tmdb"
  );

  const updateParams = (updates: { tab?: DiscoverTab; genre?: string; page?: number }) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (updates.tab) next.set("tab", updates.tab);
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

  return (
    <section className="page-shell-wide py-7 sm:py-10">
      <div className="mb-5 flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Content type">
          {tabs.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.value;
            return (
              <Button
                key={item.value}
                variant={selected ? "default" : "outline"}
                aria-pressed={selected}
                className={`min-h-10 rounded-lg px-4 ${selected ? "" : "bg-card/40"}`}
                onClick={() => updateParams({ tab: item.value, genre: "", page: 1 })}
              >
                <Icon className="mr-2 h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="discover-genre" className="text-sm text-muted-foreground">
            Genre
          </label>
          <Select
            value={selectedGenre.slug}
            onValueChange={(value) =>
              updateParams({ genre: !value || value === "all" ? "" : value, page: 1 })
            }
          >
            <SelectTrigger
              id="discover-genre"
              className="min-w-40 rounded-lg border-border/70 bg-card/70"
            >
              {selectedGenre.label
                .replace("All Movies", "All genres")
                .replace("All Shows", "All genres")
                .replace("All Anime", "All genres")}
            </SelectTrigger>
            <SelectContent>
              {genres.map((genre) => (
                <SelectItem key={genre.slug} value={genre.slug}>
                  {genre.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild className="rounded-lg">
            <Link to="/search">
              <Search className="mr-2 h-4 w-4" />
              Search
            </Link>
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-foreground">
          {selectedGenre.label
            .replace("All Movies", "Popular movies")
            .replace("All Shows", "Popular shows")
            .replace("All Anime", "Popular anime")}
        </h3>
        {paginated.totalCount !== undefined ? (
          <p className="text-sm text-muted-foreground">
            {paginated.totalCount.toLocaleString()} titles
          </p>
        ) : null}
      </div>

      {paginated.isLoading ? (
        <GridSkeleton className={DISCOVER_GRID_CLASS} />
      ) : paginated.items.length > 0 ? (
        <DiscoverResults items={paginated.items} onPlay={onPlay} />
      ) : (
        <EmptyState title={`No ${tab === "tv" ? "shows" : tab} found in this genre`} />
      )}

      {!paginated.isLoading && paginated.items.length > 0 ? (
        <div className="mt-10 flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="rounded-lg"
            disabled={!paginated.canGoBack}
            onClick={() => updateParams({ page: page - 1 })}
            aria-label="Previous results page"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="min-w-24 text-center text-sm text-muted-foreground" aria-live="polite">
            Page {paginated.currentPage}
            {paginated.totalPages ? ` of ${paginated.totalPages}` : ""}
          </p>
          <Button
            variant="outline"
            size="icon"
            className="rounded-lg"
            disabled={!paginated.hasNextPage}
            onClick={() => updateParams({ page: page + 1 })}
            aria-label="Next results page"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function DiscoverResults({ items, onPlay }: { items: ContentCard[]; onPlay: PlayHandler }) {
  return (
    <div className={DISCOVER_GRID_CLASS}>
      {items.map((item) => (
        <MovieCard key={item._id} content={item} onPlay={onPlay} layout="grid" showBookmarkAction />
      ))}
    </div>
  );
}

export function DiscoverPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const homepage = useHomepageContent();
  const featured = useMemo(() => homepage?.featured ?? [], [homepage?.featured]);
  const handlePlay = createPlayHandler(navigate);

  const handleDetails = (item: ContentFeatured) => {
    const params = new URLSearchParams(searchParams);
    if (item.tmdbId) params.set("modal", item.tmdbId);
    params.set("type", item.type);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="app-canvas min-h-screen text-foreground">
      <Header />
      <main id="main-content">
        <FeaturedDiscoverCarousel items={featured} onPlay={handlePlay} onDetails={handleDetails} />
        <DiscoverContentMode onPlay={handlePlay} />
      </main>
    </div>
  );
}
