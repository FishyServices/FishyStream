import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { ArrowDownUp, LoaderCircle, Search, Trash2, X } from "lucide-react";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { GridSkeleton } from "@/ui/components/UXPrimitives";
import {
  useMyWatchHistoryPagination,
  useRemoveFromHistory,
  useClearWatchHistory
} from "@/features/library/useWatchHistory";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import type { WatchHistoryPageItem } from "@content/contentMetadata";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  toast
} from "@fishy/ui";
import { getLocalStorageItem, setLocalStorageItem } from "@/shared/storage/browserStorage";

const HISTORY_SORT_OPTIONS = [
  { id: "recently", label: "Recently watched" },
  { id: "progress", label: "Most progress" },
  { id: "title-az", label: "Title A → Z" },
  { id: "title-za", label: "Title Z → A" }
] as const;

type HistorySortOption = (typeof HISTORY_SORT_OPTIONS)[number]["id"];
const HISTORY_SEARCH_KEY = "fishystream:history:search";
const HISTORY_SORT_KEY = "fishystream:history:sort";

function readHistoryPreference<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  if (typeof window === "undefined") return fallback;
  const stored = getLocalStorageItem(key);
  return stored && allowed.includes(stored as T) ? (stored as T) : fallback;
}

export function WatchHistoryPage() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "Watch History",
    description: "Your personal watch history on FishyStream. Pick up right where you left off.",
    path: "/history",
    noIndex: true
  });

  const [searchQuery, setSearchQuery] = useState(() =>
    typeof window === "undefined" ? "" : (getLocalStorageItem(HISTORY_SEARCH_KEY) ?? "")
  );
  const [sortBy, setSortBy] = useState<HistorySortOption>(() =>
    readHistoryPreference(
      HISTORY_SORT_KEY,
      "recently",
      HISTORY_SORT_OPTIONS.map((option) => option.id)
    )
  );
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [undoItemId, setUndoItemId] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const pendingRemovals = useRef(new Map<string, { item: WatchHistoryPageItem; timer: number }>());
  const { history, isLoading, isQueryPending, isLoadingMore, canLoadMore, loadMore } =
    useMyWatchHistoryPagination(searchQuery);
  const removeFromHistory = useRemoveFromHistory();
  const clearWatchHistory = useClearWatchHistory();

  useEffect(() => {
    setLocalStorageItem(HISTORY_SEARCH_KEY, searchQuery);
    setLocalStorageItem(HISTORY_SORT_KEY, sortBy);
  }, [searchQuery, sortBy]);

  useEffect(
    () => () => {
      for (const pending of pendingRemovals.current.values()) window.clearTimeout(pending.timer);
    },
    []
  );

  const visibleHistory = useMemo(
    () => history.filter((item) => !removedIds.has(item._id)),
    [history, removedIds]
  );
  const sortedHistory = useMemo(() => {
    if (sortBy === "recently") return visibleHistory;
    return [...visibleHistory].sort((a, b) => {
      if (sortBy === "progress") return b.progress - a.progress;
      return sortBy === "title-az"
        ? a.title.localeCompare(b.title)
        : b.title.localeCompare(a.title);
    });
  }, [sortBy, visibleHistory]);

  const handlePlay = createPlayHandler(navigate);

  const handleRemove = (item: WatchHistoryPageItem) => {
    const existing = pendingRemovals.current.get(item._id);
    if (existing) window.clearTimeout(existing.timer);
    setRemovedIds((current) => new Set(current).add(item._id));
    const timer = window.setTimeout(() => {
      pendingRemovals.current.delete(item._id);
      setUndoItemId((current) => (current === item._id ? null : current));
      void removeFromHistory(item._id).then(
        () => toast.success("Removed from history"),
        (error: unknown) => {
          setRemovedIds((current) => {
            const next = new Set(current);
            next.delete(item._id);
            return next;
          });
          toast.error(error instanceof Error ? error.message : "Failed to remove");
        }
      );
    }, 5000);
    pendingRemovals.current.set(item._id, { item, timer });
    setUndoItemId(item._id);
  };

  const handleUndo = () => {
    if (!undoItemId) return;
    const pending = pendingRemovals.current.get(undoItemId);
    if (!pending) return;
    window.clearTimeout(pending.timer);
    pendingRemovals.current.delete(undoItemId);
    setRemovedIds((current) => {
      const next = new Set(current);
      next.delete(undoItemId);
      return next;
    });
    setUndoItemId(null);
    toast.success("Restored to history");
  };

  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      for (const pending of pendingRemovals.current.values()) window.clearTimeout(pending.timer);
      pendingRemovals.current.clear();
      setUndoItemId(null);
      await clearWatchHistory();
      setRemovedIds((current) => new Set([...current, ...visibleHistory.map((item) => item._id)]));
      setIsClearDialogOpen(false);
      toast.success("History cleared");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to clear history");
    } finally {
      setIsClearing(false);
    }
  };

  const isSearching = searchQuery.trim().length > 0;
  const isInitialLoad = isLoading && history.length === 0 && !isSearching;

  return (
    <div data-fishy-page="history" className="app-canvas min-h-screen">
      <Header />

      <main id="main-content" className="page-shell-wide page-stack pb-16">
        <section aria-label="Search and sort watch history" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="media-surface relative min-w-0 flex-1 rounded-xl border-border/65 bg-card/75 p-1.5 shadow-sm">
              <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
              <Input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search watched titles"
                aria-label="Search watched titles"
                autoComplete="off"
                className="h-12 w-full rounded-lg border-0 bg-transparent py-3.5 pl-11 pr-12 text-sm text-foreground placeholder:text-muted-foreground focus-visible:ring-0"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label="Clear title search"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-[3.375rem] justify-start gap-2 rounded-xl px-4 sm:min-w-52"
                    aria-label="Sort watch history"
                  >
                    <ArrowDownUp className="h-4 w-4 text-primary" />
                    <span>
                      {HISTORY_SORT_OPTIONS.find((option) => option.id === sortBy)?.label}
                    </span>
                  </Button>
                }
              />
              <DropdownMenuContent className="w-48 rounded-lg border-border/70 bg-popover p-1">
                {HISTORY_SORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    className="rounded-md px-3 py-2 text-sm"
                    onClick={() => setSortBy(option.id)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div
            className="flex min-h-6 items-center justify-between gap-3 text-sm text-muted-foreground"
            aria-live="polite"
          >
            <p>
              {isQueryPending ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin text-primary motion-reduce:animate-none" />
                  Updating results
                </span>
              ) : isSearching ? (
                `${visibleHistory.length} matching ${visibleHistory.length === 1 ? "title" : "titles"}`
              ) : (
                `${visibleHistory.length} ${visibleHistory.length === 1 ? "title" : "titles"} shown`
              )}
            </p>
            {isSearching && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg px-2 text-muted-foreground"
                onClick={() => setSearchQuery("")}
              >
                Clear search
              </Button>
            )}
          </div>
        </section>

        {isInitialLoad ? (
          <div aria-label="Loading watch history">
            <GridSkeleton count={12} />
          </div>
        ) : visibleHistory.length === 0 && !isSearching && !isQueryPending ? (
          <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/25 px-6 py-12 text-center">
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <span className="font-display text-2xl font-semibold">▶</span>
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Nothing watched yet
            </h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              The movies and series you watch will appear here, ready when you are.
            </p>
            <Button className="mt-5 rounded-xl" onClick={() => navigate("/movies")}>
              Browse movies
            </Button>
          </section>
        ) : visibleHistory.length === 0 && isSearching && !isQueryPending ? (
          <section className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-card/25 px-6 py-12 text-center">
            <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Search className="h-6 w-6" />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">No titles found</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Try another title or clear your search to see your full history.
            </p>
            <Button
              variant="secondary"
              className="mt-5 rounded-xl"
              onClick={() => setSearchQuery("")}
            >
              Clear search
            </Button>
          </section>
        ) : visibleHistory.length === 0 && isQueryPending ? (
          <div aria-hidden="true">
            <GridSkeleton count={8} />
          </div>
        ) : (
          <>
            <div
              className={`grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 ${isQueryPending ? "opacity-60" : ""}`}
              aria-busy={isQueryPending}
            >
              {sortedHistory.map((item) => (
                <div key={item._id} className="group relative min-w-0">
                  <MovieCard content={item} onPlay={handlePlay} layout="grid" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="touch-target absolute right-2 top-2 z-20 h-10 w-10 rounded-xl border border-border/60 bg-background/85 text-muted-foreground shadow-sm hover:bg-destructive hover:text-destructive-foreground md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                    onClick={() => handleRemove(item)}
                    aria-label={`Remove ${item.title} from history`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            {canLoadMore && (
              <div className="flex justify-center pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 rounded-xl px-6"
                  onClick={loadMore}
                  disabled={isLoadingMore || isQueryPending}
                >
                  {isLoadingMore ? "Loading titles…" : "Load more titles"}
                </Button>
              </div>
            )}
          </>
        )}

        {undoItemId && pendingRemovals.current.get(undoItemId) && (
          <div className="fixed inset-x-4 bottom-6 z-floating flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-popover px-4 py-3 text-sm text-popover-foreground shadow-md sm:left-auto sm:right-6 sm:w-80">
            <span>Removed from history</span>
            <Button type="button" variant="secondary" size="sm" onClick={handleUndo}>
              Undo
            </Button>
          </div>
        )}

        <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
          <DialogContent data-content-modal="true">
            <DialogTitle>Clear watch history?</DialogTitle>
            <DialogDescription>
              This removes your watched progress and history. Saved titles in Bookmarks will remain.
            </DialogDescription>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsClearDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={isClearing} onClick={handleClearHistory}>
                {isClearing ? "Clearing…" : "Clear history"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
