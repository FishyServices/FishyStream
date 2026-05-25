import { useState } from "react";
import { useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { useAction, useConvexAuth } from "convex/react";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ContentRow } from "@/components/ContentRow";
import { useHomepageContent, useRecommendations } from "@/hooks/useContent";
import { useContinueWatching } from "@/hooks/useWatchHistory";
import { useAppSettings } from "@/hooks/useAppSettings";
import { api } from "../convex/_generated/api";
import {
  ArrowRight,
  Database,
  Film,
  Loader2,
  Tv2,
  Zap
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Toaster,
  toast
} from "@fishy/ui";

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
              { text: "New Releases", href: "/new-releases" }
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

function SyncPanel() {
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const syncContent = useAction(api.tmdb.syncContent);

  const doSync = async (type: "movies" | "tv", count: number) => {
    setSyncing(true);
    try {
      const n = await syncContent({ type, count });
      toast.success(`Synced ${n} ${type === "movies" ? "movies" : "TV shows"}`);
      setLastSynced(new Date().toLocaleTimeString());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card className="home-panel border-white/10 bg-white/4.5">
      <CardContent className="relative z-10 flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-white/74">
            <Database className="h-4 w-4" />
            <p className="kicker">Library control</p>
          </div>
          <h2 className="font-display text-2xl font-bold text-white">Keep the catalog fresh</h2>
          <p className="max-w-2xl text-sm leading-6 text-white/56">
            Load new movies and episodes from TMDB without leaving the homepage.
            {lastSynced ? ` Last sync: ${lastSynced}.` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { label: "50 Movies", type: "movies" as const, count: 50, icon: Film },
            { label: "50 TV Shows", type: "tv" as const, count: 50, icon: Tv2 },
            { label: "200 Movies", type: "movies" as const, count: 200, icon: Zap },
            { label: "200 TV Shows", type: "tv" as const, count: 200, icon: Zap }
          ].map((btn) => (
            <Button
              key={btn.label}
              size="sm"
              variant="outline"
              className="rounded-full border-white/12 bg-white/4 text-xs text-white hover:bg-white/8"
              disabled={syncing}
              onClick={() => doSync(btn.type, btn.count)}
            >
              {syncing ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <btn.icon className="mr-1.5 h-3 w-3" />
              )}
              {btn.label}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
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
    dub?: boolean
  ) => {
    const params = new URLSearchParams();
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
          <span className="text-xs text-white/54 font-medium tracking-wide">Loading FishyStream…</span>
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
    dub?: boolean
  ) => void;
  isSignedIn: boolean | undefined;
  settings: ReturnType<typeof useAppSettings>["settings"];
}) {
  const homepage = useHomepageContent();
  const categories = homepage?.categories ?? [];
  const featuredContent = homepage?.featured;
  const continueWatching = useContinueWatching() ?? [];
  const { recommendations } = useRecommendations(12);
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
          <span className="text-xs text-white/54 font-medium tracking-wide">Loading FishyStream…</span>
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
              <h2 className="font-display text-2xl font-semibold text-white">Your catalog is ready</h2>
              <p className="text-sm text-white/50 leading-relaxed">
                Welcome to FishyStream! No content is loaded in the library yet. You can enable content sync tools in your Settings page to start importing.
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
          {settings.showSyncPanel && (
            <div className="page-shell-wide mb-6">
              <SyncPanel />
            </div>
          )}

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
                cat.id === "movies"
                  ? "/movies"
                  : cat.id === "tvshows"
                    ? "/tv-shows"
                    : cat.id === "new"
                      ? "/new-releases"
                      : undefined
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
