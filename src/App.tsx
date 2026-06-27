import { useUser } from "@clerk/react";
import { useLocation, useNavigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ContentRow } from "@/components/ContentRow";
import { RailSkeleton } from "@/components/UXPrimitives";
import { useHomepageContent, useRecommendations } from "@/hooks/useContent";
import { useContinueWatching } from "@/hooks/useWatchHistory";
import { useAppSettings } from "@/hooks/useAppSettings";
import { createPlayHandler, type PlayHandler } from "@/lib/watchNavigation";
import { Film, Loader2, Search } from "lucide-react";
import { Button, Input, Toaster } from "@fishy/ui";
import { useState, type FormEvent } from "react";
import { DiscoverContentMode } from "@/pages/DiscoverPage";

export function App() {
  const { isLoaded, isSignedIn } = useUser();
  const { isLoading: isConvexAuthLoading } = useConvexAuth();
  const navigate = useNavigate();
  const { settings } = useAppSettings();

  const handlePlay = createPlayHandler(navigate);

  if (!isLoaded || isConvexAuthLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <Toaster position="top-right" richColors />
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-12 w-12 items-center justify-center">
            <div className="absolute inset-0 rounded-xl bg-primary/20 animate-pulse" />
            <div className="absolute inset-0 rounded-xl border-2 border-primary/40 animate-pulse" />
            <Loader2 className="h-5 w-5 animate-spin text-primary relative z-10" />
          </div>
          <span className="text-xs text-white/54 font-medium tracking-wide">
            Loading FishyStream…
          </span>
        </div>
      </div>
    );
  }

  return <HomepageContent handlePlay={handlePlay} isSignedIn={isSignedIn} settings={settings} />;
}

function HomepageContent({
  handlePlay,
  isSignedIn,
  settings
}: {
  handlePlay: PlayHandler;
  isSignedIn: boolean | undefined;
  settings: ReturnType<typeof useAppSettings>["settings"];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const homepage = useHomepageContent();
  const categories = homepage?.categories ?? [];
  const featuredContent = homepage?.featured;
  const continueWatching =
    useContinueWatching(!!isSignedIn && settings.showContinueWatchingRow, 6) ?? [];
  const { recommendations } = useRecommendations(8, "all", 0, !!isSignedIn);
  const [quickSearch, setQuickSearch] = useState("");
  const isDiscoverMode = location.pathname === "/discover";

  const submitQuickSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = quickSearch.trim();
    if (query) navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  if (homepage === undefined) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Toaster position="top-right" richColors />
        <Header />
        <main>
          <div className="h-[80svh] min-h-135 bg-muted/30" aria-hidden="true" />
          <div className="relative z-10 pb-10 pt-6">
            <RailSkeleton />
            <RailSkeleton />
          </div>
        </main>
      </div>
    );
  }

  const hasContent = featuredContent || categories.some((c) => c.content.length > 0);
  if (!hasContent) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Toaster position="top-right" richColors />
        <Header />
        <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-6 pt-24">
          <div className="max-w-md text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/4 border border-white/8 shadow-md">
              <Film className="h-6 w-6 text-white/60" />
            </div>
            <div className="space-y-2">
              <h2 className="font-display text-2xl font-semibold text-white">
                Catalog unavailable
              </h2>
              <p className="text-sm text-white/50 leading-relaxed">Check TMDB settings.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />
      <Header />

      <main>
        {featuredContent && featuredContent.length > 0 && (
          <Hero
            contents={featuredContent}
            onPlay={handlePlay}
            autoPlayTrailer={settings.autoPlayHeroTrailer}
            trailerMuted={settings.heroTrailerMuted}
          />
        )}
        <section className="page-shell-wide relative z-10 pb-2">
          <div className="flex justify-center">
            <div
              className="inline-flex rounded-full border border-white/10 bg-white/4 p-1"
              role="tablist"
              aria-label="Home or Discover"
            >
              <Button
                variant="ghost"
                role="tab"
                aria-selected={!isDiscoverMode}
                className={`rounded-full px-5 ${
                  !isDiscoverMode
                    ? "bg-white text-black hover:bg-white/90"
                    : "text-white/58 hover:bg-white/8 hover:text-white"
                }`}
                onClick={() => navigate("/")}
              >
                Home
              </Button>
              <Button
                variant="ghost"
                role="tab"
                aria-selected={isDiscoverMode}
                className={`rounded-full px-5 ${
                  isDiscoverMode
                    ? "bg-white text-black hover:bg-white/90"
                    : "text-white/58 hover:bg-white/8 hover:text-white"
                }`}
                onClick={() => navigate("/discover")}
              >
                Discover
              </Button>
            </div>
          </div>
        </section>
        {isDiscoverMode ? (
          <div className="relative z-10 pb-18 pt-6">
            <DiscoverContentMode onPlay={handlePlay} />
          </div>
        ) : (
          <div className="relative z-10 pb-18 pt-6">
            {settings.showContinueWatchingRow && isSignedIn && continueWatching.length > 0 && (
              <ContentRow
                title="Continue Watching"
                content={continueWatching}
                onPlay={handlePlay}
                viewAllHref="/history"
              />
            )}

            {recommendations.length > 0 && (
              <ContentRow
                title="Picked For Your Queue"
                content={recommendations}
                onPlay={handlePlay}
                viewAllHref="/my-list"
              />
            )}

            {categories.map((cat) => (
              <ContentRow
                key={cat.id}
                title={cat.title}
                content={cat.content}
                onPlay={handlePlay}
                viewAllHref={
                  cat.id === "movies" ? "/movies" : cat.id === "tvshows" ? "/tv-shows" : undefined
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
