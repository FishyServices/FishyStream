import { useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ContentRow } from "@/components/ContentRow";
import { useHomepageContent, useRecommendations } from "@/hooks/useContent";
import { useContinueWatching } from "@/hooks/useWatchHistory";
import { useAppSettings } from "@/hooks/useAppSettings";
import { Film, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Toaster } from "@fishy/ui";

function Footer() {
  return (
    <footer className="mt-14 border-t border-white/6 px-6 py-12 sm:px-10">
      <div className="page-shell-wide grid gap-6 lg:grid-cols-[1.2fr_repeat(3,minmax(0,1fr))]">
        <Card className="border-white/8 bg-white/3">
          <CardHeader className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rotate-6 rounded-xl bg-primary opacity-60" />
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-primary">
                  <span className="font-display text-sm font-bold text-white">F</span>
                </div>
              </div>
              <div>
                <p className="font-display text-lg font-bold text-white">FishyStream</p>
              </div>
            </div>
            <CardDescription className="max-w-md text-sm leading-7 text-white/52">
              Browse fast, resume instantly, and keep the interface focused on what you want to play
              next.
            </CardDescription>
          </CardHeader>
        </Card>

        {[
          {
            label: "Browse",
            links: [
              { text: "Movies", href: "/movies" },
              { text: "TV Shows", href: "/tv-shows" },
              { text: "Owner's Picks", href: "/best" }
            ]
          },
          {
            label: "Library",
            links: [
              { text: "My List", href: "/my-list" },
              { text: "Watch History", href: "/history" },
              { text: "Settings", href: "/settings" }
            ]
          },
          {
            label: "Quick genres",
            links: [
              { text: "Action", href: "/movies?genre=Action" },
              { text: "Comedy", href: "/movies?genre=Comedy" },
              { text: "Drama", href: "/tv-shows?genre=Drama" }
            ]
          }
        ].map((col) => (
          <Card key={col.label}>
            <CardHeader className="pb-3">
              <CardTitle className="kicker">{col.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {col.links.map((link) => (
                <a
                  key={link.text}
                  href={link.href}
                  className="block text-sm text-white/56 transition-colors hover:text-white"
                >
                  {link.text}
                </a>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </footer>
  );
}

export function App() {
  const { isLoaded, isSignedIn } = useUser();
  const { isLoading: isConvexAuthLoading } = useConvexAuth();
  const navigate = useNavigate();
  const { settings } = useAppSettings();

  const handlePlay = (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: "movie" | "tv"
  ) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (season !== undefined) params.set("season", String(season));
    if (episode !== undefined) params.set("episode", String(episode));
    if (source) params.set("source", source);
    if (dub) params.set("dub", "true");
    const qs = params.toString();
    navigate(`/watch/${tmdbId}${qs ? `?${qs}` : ""}`);
  };

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
  handlePlay: (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: "movie" | "tv"
  ) => void;
  isSignedIn: boolean | undefined;
  settings: ReturnType<typeof useAppSettings>["settings"];
}) {
  const homepage = useHomepageContent();
  const categories = homepage?.categories ?? [];
  const featuredContent = homepage?.featured;
  const continueWatching =
    useContinueWatching(!!isSignedIn && settings.showContinueWatchingRow, 6) ?? [];
  const { recommendations } = useRecommendations(8, "all", 0, !!isSignedIn);
  if (homepage === undefined) {
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
                Your catalog is ready
              </h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Welcome to FishyStream! TMDB did not return any titles for this session. Try
                refreshing or checking your TMDB key configuration.
              </p>
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
        <div className="relative z-10 pb-10 pt-6">
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
      </main>

      <Footer />
    </div>
  );
}

export default App;
