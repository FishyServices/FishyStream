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
import type { Doc } from "../convex/_generated/dataModel";
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
              <li>
                <a href="#" className="hover:text-white">
                  Movies
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  TV Shows
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  New Releases
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  Popular
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Support</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li>
                <a href="#" className="hover:text-white">
                  Help Center
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  Account
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  Contact Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  FAQ
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li>
                <a href="#" className="hover:text-white">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  Cookie Policy
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Connect</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li>
                <a href="#" className="hover:text-white">
                  Twitter
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  Instagram
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-white">
                  Facebook
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-between pt-8 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold">F</span>
            </div>
            <span className="font-bold">FishyStream</span>
          </div>
          <p className="text-sm text-white/40">© 2026 FishyStream. All rights reserved.</p>
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

  // TMDB Sync
  const syncTMDB = useAction(api.tmdb.syncContent);

  const handleSyncMovies = async () => {
    setIsSyncing(true);
    try {
      const count = await syncTMDB({ type: "movies", count: 50 });
      toast.success(`Synced ${count} movies from TMDB`);
    } catch (e) {
      toast.error("Failed to sync movies");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSyncTV = async () => {
    setIsSyncing(true);
    try {
      const count = await syncTMDB({ type: "tv", count: 50 });
      toast.success(`Synced ${count} TV shows from TMDB`);
    } catch (e) {
      toast.error("Failed to sync TV shows");
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePlay = (tmdbId: string) => {
    navigate(`/watch/${tmdbId}`);
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-white/60">Loading...</p>
        </div>
      </div>
    );
  }

  const hasContent = featuredContent || categories.some((c) => c.content.length > 0);

  if (!hasContent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Film className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to FishyStream</h1>
          <p className="text-white/60 mb-6">No content available. Sync from TMDB to get started.</p>
          <Button onClick={handleSyncMovies} disabled={isSyncing} size="lg">
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Sync Movies from TMDB
              </>
            )}
          </Button>
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
          {/* Developer Sync Controls */}
          <div className="px-4 sm:px-6 lg:px-12 py-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Database className="w-4 h-4" />
                  Sync Content
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Sync from TMDB</DialogTitle>
                  <DialogDescription>
                    Fetch real movie and TV show data from The Movie Database API.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Button onClick={handleSyncMovies} disabled={isSyncing} className="gap-2">
                    {isSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Sync Trending Movies
                  </Button>
                  <Button
                    onClick={handleSyncTV}
                    disabled={isSyncing}
                    variant="secondary"
                    className="gap-2"
                  >
                    {isSyncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Sync Popular TV Shows
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
