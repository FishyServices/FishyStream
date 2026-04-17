import { useNavigate } from "react-router-dom";
import { Loader2, Trash2, Check, Play } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useMyWatchHistory, useRemoveFromHistory } from "@/hooks/useWatchHistory";
import { useUser } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function WatchHistoryPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const history = useMyWatchHistory();
  const removeFromHistory = useRemoveFromHistory();

  const handlePlay = (tmdbId: string) => {
    navigate(`/watch/${tmdbId}`);
  };

  const handleRemove = async (contentId: string) => {
    try {
      await removeFromHistory(contentId as any);
      toast.success("Removed from history");
    } catch (e) {
      toast.error("Failed to remove");
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

      <main className="pt-24 px-4 sm:px-6 lg:px-12">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {history.map((item) => (
              <div key={item._id} className="relative group">
                <MovieCard content={item} onPlay={handlePlay} />
                <div className="absolute top-2 right-2 z-20 flex gap-1">
                  {item.completed && (
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 bg-black/50 text-white hover:bg-red-500/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemove(item._id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-2">
                  <div className="h-1 bg-white/20 rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${item.progress}%` }} />
                  </div>
                  <p className="text-xs text-white/70 mt-1">
                    {item.completed ? "Completed" : `${Math.round(item.progress)}% watched`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
