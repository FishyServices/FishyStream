import { useState } from "react";
import { useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { useAction } from "convex/react";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ContentRow } from "@/components/ContentRow";
import { useHomepageContent, useRecommendations } from "@/hooks/useContent";
import { useContinueWatching } from "@/hooks/useWatchHistory";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useMyWatchlist } from "@/hooks/useWatchlist";
import { api } from "../convex/_generated/api";
import {
  ArrowRight,
  Clapperboard,
  Database,
  Film,
  Loader2,
  Sparkles,
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
import type { Doc } from "../convex/_generated/dataModel";

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

function EmptyState() {
  const syncContent = useAction(api.tmdb.syncContent);
  const [syncing, setSyncing] = useState<string | null>(null);

  const doSync = async (type: "movies" | "tv") => {
    setSyncing(type);
    try {
      const n = await syncContent({ type, count: 100 });
      toast.success(
        `Synced ${n} ${type === "movies" ? "movies" : "TV shows"}! Refresh to see them.`
      );
    } catch {
      toast.error("Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 pt-28">
      <Card className="page-shell home-panel mx-auto max-w-3xl border-white/10 bg-white/4.5">
        <CardContent className="relative z-10 p-8 text-center sm:p-12">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-[1.35rem] bg-primary/15">
            <Clapperboard className="h-8 w-8 text-primary" />
          </div>
          <p className="kicker mb-3">Fresh install</p>
          <h1 className="font-display text-4xl font-bold text-white sm:text-5xl">
            Build your first shelf
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-white/58 sm:text-base">
            FishyStream is ready, the catalog just needs content. Pull in a starter set and the
            homepage will populate automatically.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              onClick={() => doSync("movies")}
              disabled={!!syncing}
              className="rounded-full px-6"
            >
              {syncing === "movies" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Sync movies
            </Button>
            <Button
              onClick={() => doSync("tv")}
              disabled={!!syncing}
              variant="secondary"
              className="rounded-full border border-white/14 bg-white/8 px-6 text-white hover:bg-white/[0.14]"
            >
              {syncing === "tv" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Tv2 className="mr-2 h-4 w-4" />
              )}
              Sync TV shows
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function App() {
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const homepage = useHomepageContent();
  const categories = homepage?.categories ?? [];
  const featuredContent = homepage?.featured;
  const continueWatching = useContinueWatching() ?? [];
  const watchlist = useMyWatchlist();
  const { recommendations } = useRecommendations(watchlist, 12);
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

  const hasContent = featuredContent || categories.some((c) => c.content.length > 0);
  if (!hasContent)
    return (
      <>
        <Toaster position="top-right" richColors />
        <Header />
        <EmptyState />
      </>
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />
      <Header />

      <main>
        {featuredContent && (
          <Hero
            content={featuredContent}
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

          {settings.showContinueWatchingRow &&
            isLoaded &&
            isSignedIn &&
            continueWatching.length > 0 && (
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
