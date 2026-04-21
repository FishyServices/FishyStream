import { useState } from "react";
import { useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { Toaster, toast } from "sonner";
import { useAction } from "convex/react";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ContentRow } from "@/components/ContentRow";
import { useFeaturedContent, useAllCategories } from "@/hooks/useContent";
import { useContinueWatching } from "@/hooks/useWatchHistory";
import { api } from "../convex/_generated/api";
import { Film, Loader2, RefreshCw, Database, Sparkles, Tv2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

function Footer() {
  return (
    <footer className="border-t border-white/5 py-12 px-6 sm:px-10 mt-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
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
              label: "Account",
              links: [
                { text: "My List", href: "/my-list" },
                { text: "Watch History", href: "/history" }
              ]
            },
            {
              label: "Genres",
              links: [
                { text: "Action", href: "/movies?genre=Action" },
                { text: "Comedy", href: "/movies?genre=Comedy" },
                { text: "Drama", href: "/movies?genre=Drama" },
                { text: "Sci-Fi", href: "/movies?genre=Sci-Fi" }
              ]
            }
          ].map((col) => (
            <div key={col.label}>
              <h3 className="text-sm font-display font-bold text-white mb-4">{col.label}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.text}>
                    <a
                      href={link.href}
                      className="text-sm text-white/40 hover:text-white/80 transition-colors"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
                <span className="text-white font-bold font-display text-xs">F</span>
              </div>
              <span className="font-display font-bold text-white">FishyStream</span>
            </div>
            <p className="text-sm text-white/30 leading-relaxed">
              Your personal streaming hub. Watch what you love, everywhere.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-8 border-t border-white/5 flex-wrap gap-4">
          <p className="text-xs text-white/20">© 2026 FishyStream</p>
          <p className="text-xs text-white/20">Content data from TMDB</p>
        </div>
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
    <div className="mx-6 sm:mx-10 mb-6 p-4 rounded-xl bg-white/4 border border-white/8">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-white/40" />
          <span className="text-sm font-medium text-white/70">Content Library</span>
          {lastSynced && <span className="text-xs text-white/30">• Last synced {lastSynced}</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          { label: "Sync 50 Movies", type: "movies" as const, count: 50, icon: Film },
          { label: "Sync 50 TV Shows", type: "tv" as const, count: 50, icon: Tv2 },
          { label: "Sync 200 Movies", type: "movies" as const, count: 200, icon: Zap },
          { label: "Sync 200 TV Shows", type: "tv" as const, count: 200, icon: Zap }
        ].map((btn) => (
          <Button
            key={btn.label}
            size="sm"
            variant="outline"
            className="text-xs border-white/15 text-white/60 hover:text-white hover:border-white/30"
            disabled={syncing}
            onClick={() => doSync(btn.type, btn.count)}
          >
            {syncing ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <btn.icon className="w-3 h-3 mr-1.5" />
            )}
            {btn.label}
          </Button>
        ))}
      </div>
    </div>
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
    } catch (e) {
      toast.error("Sync failed");
    } finally {
      setSyncing(null);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-primary/15 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Film className="w-8 h-8 text-primary" />
        </div>
        <h1 className="font-display text-2xl font-bold text-white mb-2">Welcome to FishyStream</h1>
        <p className="text-white/50 mb-8 text-sm leading-relaxed">
          Your library is empty. Sync content from TMDB to get started.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={() => doSync("movies")} disabled={!!syncing} className="font-display">
            {syncing === "movies" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Sync Movies from TMDB
          </Button>
          <Button
            onClick={() => doSync("tv")}
            disabled={!!syncing}
            variant="secondary"
            className="font-display"
          >
            {syncing === "tv" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Tv2 className="w-4 h-4 mr-2" />
            )}
            Sync TV Shows from TMDB
          </Button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const categories = useAllCategories();
  const featuredContent = useFeaturedContent();
  const continueWatching = useContinueWatching() ?? [];

  const handlePlay = (tmdbId: string, season?: number, episode?: number) => {
    const params = new URLSearchParams();
    if (season !== undefined) params.set("season", String(season));
    if (episode !== undefined) params.set("episode", String(episode));
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
        {featuredContent && <Hero content={featuredContent} onPlay={handlePlay} />}

        <div className="relative -mt-16 z-10 pt-4 pb-8 space-y-1">
          {/* Sync panel */}
          <SyncPanel />

          {/* Continue Watching */}
          {isLoaded && isSignedIn && continueWatching.length > 0 && (
            <ContentRow
              title="Continue Watching"
              content={continueWatching}
              onPlay={handlePlay}
              viewAllHref="/history"
            />
          )}

          {/* Content rows */}
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
