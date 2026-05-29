import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Trash2, Check, Play } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useMyWatchHistory, useRemoveFromHistory } from "@/hooks/useWatchHistory";
import { useUser } from "@clerk/react";
import { Button, toast } from "@FishyServices/ui";

export function WatchHistoryPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const historyData = useMyWatchHistory();
  const [history, setHistory] = useState<typeof historyData>(undefined);
  const removeFromHistory = useRemoveFromHistory();

  useEffect(() => {
    setHistory(historyData);
  }, [historyData]);

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

  const handleRemove = async (contentId: string) => {
    try {
      await removeFromHistory(contentId as any);
      setHistory((current) => current?.filter((item) => item._id !== contentId));
      toast.success("Removed from history");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove";
      toast.error(message);
      console.error("Remove from history error:", err);
    }
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-2">Watch History</h1>
            <p className="text-white/60">Please sign in to view your watch history.</p>
          </div>
        </div>
      </div>
    );
  }

  if (history === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="page-stack px-4 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">Watch History</h1>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60 mb-4">Your watch history is empty.</p>
            <p className="text-white/40 text-sm">
              Start watching movies and shows to see them here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {history.map((item) => (
              <div key={item._id} className="relative group">
                <MovieCard content={item} onPlay={handlePlay} layout="grid" />
                <div className="absolute top-2 right-2 z-20">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 bg-black/60 text-white opacity-100 transition-opacity hover:bg-red-500/80 md:opacity-0 md:group-hover:opacity-100"
                    onClick={() => handleRemove(item._id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
