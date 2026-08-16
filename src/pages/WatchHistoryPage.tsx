import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Search, Trash2, X } from "lucide-react";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import {
  useMyWatchHistoryPagination,
  useRemoveFromHistory
} from "@/features/library/useWatchHistory";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import { Button, Input, toast } from "@fishy/ui";

export function WatchHistoryPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "Watch History",
    description: "Your personal watch history on FishyStream. Pick up right where you left off.",
    path: "/history",
    noIndex: true
  });

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const { history, isLoading, isLoadingMore, canLoadMore, loadMore } =
    useMyWatchHistoryPagination(searchQuery);
  const removeFromHistory = useRemoveFromHistory();

  const visibleHistory = history.filter((item) => !removedIds.has(item._id));
  const normalizedQuery = searchQuery
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
  const filteredHistory = normalizedQuery
    ? visibleHistory.filter((item) =>
        item.title
          .toLocaleLowerCase()
          .replace(/[^\p{L}\p{N}]/gu, "")
          .includes(normalizedQuery)
      )
    : visibleHistory;

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
      <div className="app-canvas min-h-screen">
        <Header />
        <div className="page-shell-wide page-stack">
          <GridSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="app-canvas min-h-screen">
      <Header />

      <main className="page-shell-wide page-stack">
        <PageHeader
          title="History"
          actions={
            <span className="rounded-full border border-border/65 bg-card/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              {visibleHistory.length} watched
            </span>
          }
        />

        {visibleHistory.length > 0 && (
          <div className="mb-6 max-w-xl">
            <div className="media-surface relative rounded-xl border-border/65 bg-card/72 p-1.5 shadow-sm">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search your history"
                aria-label="Search your history"
                className="h-12 w-full rounded-xl border-0 bg-transparent py-3.5 pl-11 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear history search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {visibleHistory.length === 0 ? (
          <EmptyState
            title="Nothing watched yet"
            action={
              <Button className="rounded-xl" onClick={() => navigate("/movies")}>
                Browse movies
              </Button>
            }
          />
        ) : filteredHistory.length === 0 ? (
          <EmptyState
            icon={<Search className="h-12 w-12" />}
            title={`No history matches “${searchQuery.trim()}”`}
            action={
              <Button variant="secondary" className="rounded-xl" onClick={() => setSearchQuery("")}>
                Clear search
              </Button>
            }
          />
        ) : (
          <>
            <div className="rounded-xl border border-border/55 bg-card/28 p-3 sm:p-5">
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {filteredHistory.map((item) => (
                  <div key={item._id} className="group relative">
                    <MovieCard content={item} onPlay={handlePlay} layout="grid" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 z-20 h-8 w-8 rounded-xl border border-border/60 bg-background/85 text-muted-foreground opacity-100 shadow-sm transition-opacity hover:bg-destructive hover:text-destructive-foreground md:opacity-0 md:group-hover:opacity-100"
                      onClick={() => handleRemove(item._id)}
                      aria-label={`Remove ${item.title} from history`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {canLoadMore && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl"
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
