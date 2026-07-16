import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Trash2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/UXPrimitives";
import { useMyWatchHistory, useRemoveFromHistory } from "@/hooks/useWatchHistory";
import { createPlayHandler } from "@/lib/watchNavigation";
import { Button, toast } from "@fishy/ui";

export function WatchHistoryPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "Watch History",
    description: "Your personal watch history on FishyStream. Pick up right where you left off.",
    path: "/history",
    noIndex: true
  });
  const historyData = useMyWatchHistory();
  const [history, setHistory] = useState<typeof historyData>(undefined);
  const removeFromHistory = useRemoveFromHistory();

  useEffect(() => {
    setHistory(historyData);
  }, [historyData]);

  const handlePlay = createPlayHandler(navigate);

  const handleRemove = async (contentId: string) => {
    try {
      await removeFromHistory(contentId as any);
      setHistory((current) => current?.filter((item) => item._id !== contentId));
      toast.success("Removed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove";
      toast.error(message);
      console.error("Remove from history error:", err);
    }
  };

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
        <PageHeader title="History" />

        {history.length === 0 ? (
          <EmptyState
            title="Nothing watched yet"
            action={
              <Button className="rounded-full" onClick={() => navigate("/movies")}>
                Browse movies
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {history.map((item) => (
              <div key={item._id} className="group relative">
                <MovieCard content={item} onPlay={handlePlay} layout="grid" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 z-20 h-8 w-8 rounded-md bg-black/60 text-white opacity-100 transition-opacity hover:bg-red-500/80 md:opacity-0 md:group-hover:opacity-100"
                  onClick={() => handleRemove(item._id)}
                  aria-label={`Remove ${item.title} from history`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
