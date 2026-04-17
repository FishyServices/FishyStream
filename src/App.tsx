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
import { Film, Loader2, RefreshCw, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

function Footer() {
  return (
    <footer className="bg-background border-t border-white/10 py-12 px-4 sm:px-6 lg:px-12 mt-12">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Browse</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li><a href="/movies" className="hover:text-white transition-colors">Movies</a></li>
              <li><a href="/tv-shows" className="hover:text-white transition-colors">TV Shows</a></li>
              <li><a href="/new-releases" className="hover:text-white transition-colors">New Releases</a></li>
              <li><a href="/popular" className="hover:text-white transition-colors">Popular</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Account</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li><a href="/my-list" className="hover:text-white transition-colors">My List</a></li>
              <li><a href="/history" className="hover:text-white transition-colors">Watch History</a></li>
              <li><a href="/migration" className="hover:text-white transition-colors">Import Data</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Info</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li><span className="text-white/30 cursor-default">Privacy Policy</span></li>
              <li><span className="text-white/30 cursor-default">Terms of Service</span></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">FishyStream</h3>
            <p className="text-sm text-white/40 leading-relaxed">
              Stream your favorite movies and TV shows.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between pt-8 border-t border-white/10 flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold">F</span>
            </div>
            <span className="font-bold text-white">FishyStream</span>
          </div>
          <p className="text-sm text-white/30">© 2026 FishyStream. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  const { isLoaded, isSignedIn } = useUser();
  const navigate = useNavigate();
  const categories = useAllCategories();
  const featuredContent = useFeaturedContent();
  const continueWatching = useContinueWatching() ?? [];
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);

  const syncTMDB = useAction(api.tmdb.syncContent);

  const handleSyncMovies = async () => {
    setIsSyncing(true);
    try {
      const count = await syncTMDB({ type: "movies", count: 1000 });
      toast.success(`Synced ${count} movies from TMDB`);
      setSyncDialogOpen(false);
    } catch {
      toast.error("Failed to sync movies");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncTV = async () => {
    setIsSyncing(true);
    try {
      const count = await syncTMDB({ type: "tv", count: 1000 });
      toast.success(`Synced ${count} TV shows from TMDB`);
      setSyncDialogOpen(false);
    } catch {
      toast.error("Failed to sync TV shows");
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePlay = (tmdbId: string, season?: number, episode?: number) => {
    const params = new URLSearchParams();
    if (season !== undefined) params.set("season", String(season));
    if (episode !== undefined) params.set("episode", String(episode));
    const query = params.toString();
    navigate(`/watch/${tmdbId}${query ? `?${query}` : ""}`);
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/60 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  const hasContent = featuredContent || categories.some((c) => c.content.length > 0);

  if (!hasContent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Film className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to FishyStream</h1>
          <p className="text-white/50 mb-6 text-sm">
            No content yet. Pull a TMDB catalog batch to get started.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleSyncMovies} disabled={isSyncing} size="lg">
              {isSyncing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Syncing...</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-2" />Sync Movies</>
              )}
            </Button>
            <Button onClick={handleSyncTV} disabled={isSyncing} size="lg" variant="secondary">
              {isSyncing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Syncing...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" />Sync TV Shows</>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />
      <Header />

      <main>
        {featuredContent && <Hero content={featuredContent} onPlay={handlePlay} />}

        <div className="relative -mt-24 z-10 space-y-2 pb-8">
          {/* Sync button */}
          <div className="px-4 sm:px-6 lg:px-12 py-2">
            <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 text-white/70 border-white/20 hover:border-white/40">
                  <Database className="w-3.5 h-3.5" />
                  Sync Content
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                  <DialogTitle>Sync TMDB Catalog</DialogTitle>
                  <DialogDescription>
                    Pull up to 1,000 titles from TMDB's discover API.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-3 py-2">
                  <Button onClick={handleSyncMovies} disabled={isSyncing} className="gap-2">
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                    Sync Movie Catalog
                  </Button>
                  <Button onClick={handleSyncTV} disabled={isSyncing} variant="secondary" className="gap-2">
                    {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Sync TV Catalog
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isSignedIn && continueWatching.length > 0 && (
            <ContentRow
              title="Continue Watching"
              content={continueWatching}
              onPlay={handlePlay}
            />
          )}

          {categories.map((category) => (
            <ContentRow
              key={category.id}
              title={category.title}
              content={category.content}
              onPlay={handlePlay}
            />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default App;
