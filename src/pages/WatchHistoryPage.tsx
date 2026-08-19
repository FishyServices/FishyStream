import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { ArrowDownUp, Search, Trash2, X } from "lucide-react";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import {
  useMyWatchHistoryPagination,
  useRemoveFromHistory,
  useClearWatchHistory
} from "@/features/library/useWatchHistory";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import type { WatchHistoryItemMeta } from "@content/contentMetadata";
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

const HISTORY_SORT_OPTIONS = [
  { id: "recently", label: "Recently watched" },
  { id: "progress", label: "Most progress" },
  { id: "title-az", label: "Title A → Z" },
  { id: "title-za", label: "Title Z → A" }
] as const;

type HistorySortOption = (typeof HISTORY_SORT_OPTIONS)[number]["id"];
const HISTORY_SEARCH_KEY = "history:search";
const HISTORY_SORT_KEY = "history:sort";

function readHistoryPreference<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
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

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem(HISTORY_SEARCH_KEY) ?? "")
  );
  const [sortBy, setSortBy] = useState<HistorySortOption>(() =>
    readHistoryPreference(
      HISTORY_SORT_KEY,
      "recently",
      HISTORY_SORT_OPTIONS.map((option) => option.id)
    )
  );
  const [undoItemId, setUndoItemId] = useState<string | null>(null);
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const pendingRemovals = useRef(new Map<string, { item: WatchHistoryItemMeta; timer: number }>());
  const { history, isLoading, isLoadingMore, canLoadMore, loadMore } =
    useMyWatchHistoryPagination(searchQuery);
  const removeFromHistory = useRemoveFromHistory();
  const clearWatchHistory = useClearWatchHistory();

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(HISTORY_SEARCH_KEY, searchQuery);
      window.localStorage.setItem(HISTORY_SORT_KEY, sortBy);
    }
  }, [searchQuery, sortBy]);

  useEffect(
    () => () => {
      for (const pending of pendingRemovals.current.values()) window.clearTimeout(pending.timer);
    },
    []
  );

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
  const sortedHistory = useMemo(() => {
    if (sortBy === "recently") return filteredHistory;
    return [...filteredHistory].sort((a, b) => {
      if (sortBy === "progress") return b.progress - a.progress;
      return sortBy === "title-az"
        ? a.title.localeCompare(b.title)
        : b.title.localeCompare(a.title);
    });
  }, [filteredHistory, sortBy]);

  const handlePlay = createPlayHandler(navigate);

  const handleRemove = (item: WatchHistoryItemMeta) => {
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
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-border/65 bg-card/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                {visibleHistory.length} watched
              </span>
              {visibleHistory.length > 0 && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => setIsClearDialogOpen(true)}
                >
                  Clear history
                </Button>
              )}
            </div>
          }
        />

        {visibleHistory.length > 0 && (
          <div className="mb-6 flex max-w-2xl flex-col gap-2 sm:flex-row">
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
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-12 w-12 shrink-0 rounded-xl"
                    aria-label="Sort history"
                    title={HISTORY_SORT_OPTIONS.find((option) => option.id === sortBy)?.label}
                  >
                    <ArrowDownUp className="h-4 w-4" />
                  </Button>
                }
              />
              <DropdownMenuContent className="w-48 rounded-xl border-border/70 bg-popover p-1">
                {HISTORY_SORT_OPTIONS.map((option) => (
                  <DropdownMenuItem
                    key={option.id}
                    className="rounded-md px-3 py-2 text-xs"
                    onClick={() => setSortBy(option.id)}
                  >
                    {option.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
                {sortedHistory.map((item) => (
                  <div key={item._id} className="group relative">
                    <MovieCard content={item} onPlay={handlePlay} layout="grid" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-2 z-20 h-8 w-8 rounded-xl border border-border/60 bg-background/85 text-muted-foreground opacity-100 shadow-sm transition-opacity hover:bg-destructive hover:text-destructive-foreground md:opacity-0 md:group-hover:opacity-100"
                      onClick={() => handleRemove(item)}
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

        {undoItemId && pendingRemovals.current.get(undoItemId) && (
          <div className="fixed inset-x-4 bottom-6 z-50 flex items-center justify-between gap-4 rounded-xl border border-border/70 bg-popover px-4 py-3 text-sm text-popover-foreground shadow-md sm:left-auto sm:right-6 sm:w-80">
            <span>Removed from history</span>
            <Button type="button" variant="secondary" size="sm" onClick={handleUndo}>
              Undo
            </Button>
          </div>
        )}

        <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
          <DialogContent>
            <DialogTitle>Clear watch history?</DialogTitle>
            <DialogDescription>
              This removes your watched progress and history. Saved titles in My List will remain.
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
