import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUp, ChevronLeft, ChevronRight, Film, Info, Play, Sparkles, Tv } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { GridSkeleton } from "@/components/UXPrimitives";
import { useHomepageContent, usePaginatedContent } from "@/hooks/useContent";
import { Button } from "@fishy/ui";
import type { ContentCard, ContentFeatured, ContentType } from "../../shared/contentMetadata";

type DiscoverTab = "movies" | "tv";

const tabs: Array<{ value: DiscoverTab; label: string; icon: typeof Film }> = [
  { value: "movies", label: "Movies", icon: Film },
  { value: "tv", label: "TV Shows", icon: Tv }
];

function parseTab(value: string | null): DiscoverTab {
  if (value === "movies" || value === "tv") return value;
  return "movies";
}

function buildWatchUrl(
  tmdbId: string,
  season?: number,
  episode?: number,
  source?: string,
  dub?: boolean,
  type?: ContentType
) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (season !== undefined) params.set("season", String(season));
  if (episode !== undefined) params.set("episode", String(episode));
  if (source) params.set("source", source);
  if (dub) params.set("dub", "true");
  const qs = params.toString();
  return `/watch/${tmdbId}${qs ? `?${qs}` : ""}`;
}

function FeaturedDiscoverCarousel({
  items,
  onPlay,
  onDetails
}: {
  items: ContentFeatured[];
  onPlay: (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: ContentType
  ) => void;
  onDetails: (item: ContentFeatured) => void;
}) {
  const [index, setIndex] = useState(0);
  const active = items[index];

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % items.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [items.length]);

  useEffect(() => {
    if (index >= items.length) setIndex(0);
  }, [index, items.length]);

  if (!active) {
    return <div className="h-[74vh] min-h-140 bg-muted/30" aria-hidden="true" />;
  }

  const move = (direction: 1 | -1) => {
    setIndex((current) => (current + direction + items.length) % items.length);
  };

  return (
    <section className="relative h-[76vh] min-h-145 overflow-hidden">
      {items.map((item, itemIndex) => (
        <div
          key={item._id}
          className={`absolute inset-0 transition-opacity duration-700 ${
            itemIndex === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <img
            src={item.backdropUrl || item.posterUrl}
            alt=""
            className="h-full w-full object-cover"
            decoding="async"
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-linear-to-r from-black/95 via-black/45 to-black/10" />
      <div className="absolute inset-0 bg-linear-to-t from-background via-background/20 to-black/10" />

      <div className="page-shell-wide absolute inset-x-0 bottom-18 z-10">
        <div className="max-w-3xl space-y-5">
          {active.logoUrl ? (
            <img
              src={active.logoUrl}
              alt={active.title}
              className="max-h-24 max-w-[min(22rem,78vw)] object-contain object-left drop-shadow-2xl"
            />
          ) : (
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              {active.title}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-white/72">
            {active.year ? <span>{active.year}</span> : null}
            {active.rating ? (
              <span className="rounded-md border border-white/20 px-2 py-0.5">{active.rating}</span>
            ) : null}
            {active.voteAverage ? <span>{active.voteAverage.toFixed(1)} TMDB</span> : null}
            {active.seasons ? <span>{active.seasons} seasons</span> : null}
          </div>
          {active.description ? (
            <p className="line-clamp-3 max-w-2xl text-base leading-7 text-white/74">
              {active.description}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              className="rounded-md bg-white px-6 text-black hover:bg-white/90"
              onClick={() =>
                active.tmdbId &&
                onPlay(
                  active.tmdbId,
                  active.type === "tv" ? 1 : undefined,
                  active.type === "tv" ? 1 : undefined,
                  undefined,
                  undefined,
                  active.type
                )
              }
            >
              <Play className="mr-2 h-4 w-4 fill-black" />
              Play now
            </Button>
            <Button
              variant="secondary"
              className="rounded-md border border-white/18 bg-black/55 text-white hover:bg-black/75"
              onClick={() => onDetails(active)}
            >
              <Info className="mr-2 h-4 w-4" />
              More info
            </Button>
          </div>
        </div>
      </div>

      {items.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full bg-black/35 text-white hover:bg-black/55"
            onClick={() => move(-1)}
            aria-label="Previous featured title"
          >
            <ChevronLeft className="h-6 w-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full bg-black/35 text-white hover:bg-black/55"
            onClick={() => move(1)}
            aria-label="Next featured title"
          >
            <ChevronRight className="h-6 w-6" />
          </Button>
          <div className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 gap-2">
            {items.map((item, itemIndex) => (
              <Button
                key={item._id}
                variant="ghost"
                className={`h-2 min-h-0 rounded-full p-0 ${
                  itemIndex === index ? "w-7 bg-white" : "w-2 bg-white/45"
                }`}
                onClick={() => setIndex(itemIndex)}
                aria-label={`Show ${item.title}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function DiscoverRail({
  title,
  items,
  onPlay
}: {
  title: string;
  items: ContentCard[];
  onPlay: (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: ContentType
  ) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="page-shell-wide flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-foreground sm:text-xl">{title}</h2>
      </div>
      <div className="carousel-fade page-shell-wide flex snap-x snap-mandatory gap-3 overflow-x-auto pb-5 sm:gap-4">
        {items.map((item) => (
          <MovieCard key={item._id} content={item} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

function MediaDiscoverContent({
  type,
  onPlay
}: {
  type: "movie" | "tv";
  onPlay: (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: ContentType
  ) => void;
}) {
  const trending = usePaginatedContent(type, undefined, "trending", 20, 1);
  const popular = usePaginatedContent(type, undefined, "popular", 20, 1);
  const latest = usePaginatedContent(type, undefined, "new", 20, 1);
  const topRated = usePaginatedContent(type, undefined, "rating", 20, 1);
  const action = usePaginatedContent(type, "Action", "popular", 20, 1);
  const comedy = usePaginatedContent(type, "Comedy", "popular", 20, 1);
  const drama = usePaginatedContent(type, "Drama", "popular", 20, 1);
  const horror = usePaginatedContent(type, "Horror", "popular", 20, 1);
  const hasAny =
    trending.items.length ||
    popular.items.length ||
    latest.items.length ||
    topRated.items.length ||
    action.items.length ||
    comedy.items.length ||
    drama.items.length ||
    horror.items.length;

  if (
    !hasAny &&
    (trending.isLoading || popular.isLoading || latest.isLoading || topRated.isLoading)
  ) {
    return (
      <div className="page-shell-wide">
        <GridSkeleton count={12} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DiscoverRail
        title={type === "tv" ? "For You: Shows" : "For You: Movies"}
        items={trending.items}
        onPlay={onPlay}
      />
      <DiscoverRail
        title={type === "tv" ? "Popular Shows" : "Popular Movies"}
        items={popular.items}
        onPlay={onPlay}
      />
      <DiscoverRail
        title={type === "tv" ? "On Air" : "Latest Releases"}
        items={latest.items}
        onPlay={onPlay}
      />
      <DiscoverRail title="Top Rated" items={topRated.items} onPlay={onPlay} />
      <DiscoverRail title="Action" items={action.items} onPlay={onPlay} />
      <DiscoverRail title="Comedy" items={comedy.items} onPlay={onPlay} />
      <DiscoverRail title="Drama" items={drama.items} onPlay={onPlay} />
      <DiscoverRail title="Horror" items={horror.items} onPlay={onPlay} />
    </div>
  );
}

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 420);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Button
      variant="secondary"
      className={`fixed bottom-5 left-5 z-50 rounded-full border border-white/12 bg-background/82 px-4 text-white shadow-lg backdrop-blur-md transition-all md:left-1/2 md:-translate-x-1/2 ${
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="mr-2 h-4 w-4" />
      <span className="hidden sm:inline">Back to top</span>
    </Button>
  );
}

export function DiscoverContentMode({
  onPlay
}: {
  onPlay: (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: ContentType
  ) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = (nextTab: DiscoverTab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", nextTab);
      return next;
    });
  };

  return (
    <>
      <div className="relative z-20 px-4 pb-6 pt-2 md:px-10">
        <div className="mx-auto flex max-w-7xl justify-center">
          <div className="flex gap-3 rounded-full border border-white/10 bg-background/86 p-1.5 shadow-2xl shadow-black/40 backdrop-blur-md">
            {tabs.map((item) => (
              <Button
                key={item.value}
                variant="ghost"
                className={`rounded-full px-4 text-base font-bold transition-transform md:text-xl ${
                  tab === item.value
                    ? "scale-105 bg-white text-black hover:bg-white/90"
                    : "text-white/54 hover:bg-white/8 hover:text-white"
                }`}
                onClick={() => setTab(item.value)}
              >
                <item.icon className="mr-2 hidden h-4 w-4 sm:block" />
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative z-20 space-y-8 px-0 pb-20 pt-2">
        {tab === "tv" ? (
          <MediaDiscoverContent type="tv" onPlay={onPlay} />
        ) : (
          <MediaDiscoverContent type="movie" onPlay={onPlay} />
        )}
      </div>

      <ScrollToTopButton />
    </>
  );
}

export function DiscoverPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const homepage = useHomepageContent();
  const featured = useMemo(() => homepage?.featured ?? [], [homepage?.featured]);

  const handlePlay = (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: ContentType
  ) => navigate(buildWatchUrl(tmdbId, season, episode, source, dub, type));

  const handleDetails = (item: ContentFeatured) => {
    const params = new URLSearchParams(searchParams);
    if (item.tmdbId) params.set("modal", item.tmdbId);
    params.set("type", item.type);
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main>
        <FeaturedDiscoverCarousel items={featured} onPlay={handlePlay} onDetails={handleDetails} />
        <DiscoverContentMode onPlay={handlePlay} />
      </main>
    </div>
  );
}
