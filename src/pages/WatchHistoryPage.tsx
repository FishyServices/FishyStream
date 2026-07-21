import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Trash2 } from "lucide-react";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import {
  useMyWatchHistoryPagination,
  useRemoveFromHistory
} from "@/features/library/useWatchHistory";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import { Button, toast } from "@fishy/ui";

export function WatchHistoryPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "Watch History",
    description: "Your personal watch history on FishyStream. Pick up right where you left off.",
    path: "/history",
    noIndex: true
  });

  const { history, isLoading, isLoadingMore, canLoadMore, loadMore } =
    useMyWatchHistoryPagination();
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const removeFromHistory = useRemoveFromHistory();

  const visibleHistory = history.filter((item) => !removedIds.has(item._id));

  const handlePlay = createPlayHandler(navigate);

  const handleRemove = async (contentId: string) => {
    setRemovedIds((current) => new Set(current).add(contentId));
    try {
      await removeFromHistory(contentId as any);
      toast.success("Removed");
    } catch (err) {
      setRemovedIds((current) => {
        const next = new Set(current);
        next.delete(contentId);
        return next;
      });
      const message = err instanceof Error ? err.message : "Failed to remove";
      toast.error(message);
      console.error("Remove from history error:", err);
    }
  };

  if (isLoading) {
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

        {visibleHistory.length === 0 ? (
          <EmptyState
            title="Nothing watched yet"
            action={
              <Button className="rounded-full" onClick={() => navigate("/movies")}>
                Browse movies
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {visibleHistory.map((item) => (
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

            {canLoadMore && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-md"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? "Loading…" : "Load more items"}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
