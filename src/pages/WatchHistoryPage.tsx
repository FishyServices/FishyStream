import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/UXPrimitives";
import { useMyWatchHistory, useRemoveFromHistory } from "@/hooks/useWatchHistory";
import { useUser } from "@clerk/react";
import { Button, toast } from "@fishy/ui";

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
          <EmptyState title="Sign in to view history" />
        </div>
      </div>
    );
  }

  if (history === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="page-shell-wide page-stack">
          <GridSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="page-shell-wide page-stack">
        <PageHeader title="Watch History" />

        {history.length === 0 ? (
          <EmptyState title="No history" />
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
                    aria-label={`Remove ${item.title} from history`}
                    title={`Remove ${item.title} from history`}
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
