import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import {
  Sparkles,
  RefreshCw,
  Film,
  Tv,
  BookMarked,
  FolderPlus,
  Folder,
  Trash2,
  MoreHorizontal,
  ArrowDownUp,
  LayoutGrid,
  List,
  Play,
  Search,
  X,
  CheckSquare,
  Square,
  Pencil,
  ChevronDown,
  ChevronRight,
  ListMinus
} from "lucide-react";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import {
  useMyWatchlistPagination,
  useUpdateWatchlistFolder,
  useToggleWatchlist,
  type WatchlistSnapshot
} from "@/features/library/useWatchlist";
import { useUser } from "@clerk/react";
import { useRecommendations } from "@/features/catalog/queries/useContent";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from "@fishy/ui";
import type { ContentId, WatchlistGridItem } from "@content/contentMetadata";
import {
  getCustomFolders,
  setCustomFolders as setLSCustomFolders
} from "@/shared/storage/localStorageStore";

const SORT_OPTIONS = [
  { id: "recently", label: "Recently added" },
  { id: "oldest", label: "Oldest added" },
  { id: "title-az", label: "Title A → Z" },
  { id: "title-za", label: "Title Z → A" }
] as const;

type SortOption = (typeof SORT_OPTIONS)[number]["id"];
type ViewLayout = "grid" | "list";
type TypeFilter = "all" | "movie" | "tv";

const SORT_PREF_KEY = "mylist:sort";
const VIEW_PREF_KEY = "mylist:view";

function itemToSnapshot(item: WatchlistGridItem): WatchlistSnapshot {
  return {
    tmdbId: item.tmdbId ?? "",
    type: item.type,
    title: item.title,
    posterUrl: item.posterUrl
  };
}

function pluralize(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function readStoredPref<T extends string>(key: string, fallback: T, allowed: readonly T[]): T {
  if (typeof window === "undefined") return fallback;
  const stored = window.localStorage.getItem(key);
  return stored && (allowed as readonly string[]).includes(stored) ? (stored as T) : fallback;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function FolderPickerItems({
  folderOptions,
  onSelect
}: {
  folderOptions: string[];
  onSelect: (folder: string) => void;
}) {
  return (
    <>
      <DropdownMenuItem
        className="rounded-md px-3 py-2 text-xs font-medium text-white/70 focus:bg-white focus:text-black"
        onClick={() => onSelect("unsorted")}
      >
        Unsorted
      </DropdownMenuItem>
      {folderOptions.map((folder) => (
        <DropdownMenuItem
          key={folder}
          className="rounded-md px-3 py-2 text-xs font-medium text-white/70 focus:bg-white focus:text-black"
          onClick={() => onSelect(folder)}
        >
          {folder}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function ItemActionsMenu({
  folderOptions,
  isOpen,
  onOpenChange,
  onAssignFolder,
  onRemove,
  trigger
}: {
  folderOptions: string[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAssignFolder: (folder: string) => void;
  onRemove: () => void;
  trigger: ReactElement;
}) {
  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent className="w-56 rounded-lg border border-white/10 bg-popover p-1 shadow-md">
        <FolderPickerItems folderOptions={folderOptions} onSelect={onAssignFolder} />
        <div className="my-1 h-px bg-white/10" />
        <DropdownMenuItem
          className="rounded-md px-3 py-2 text-xs font-medium text-red-300 focus:bg-red-500/10 focus:text-red-200"
          onClick={onRemove}
        >
          <ListMinus className="mr-2 inline h-4 w-4" />
          Remove from list
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface WatchlistCardProps {
  item: WatchlistGridItem;
  layout: ViewLayout;
  selectionMode: boolean;
  isSelected: boolean;
  isDragging: boolean;
  isMenuOpen: boolean;
  canDrag: boolean;
  folderOptions: string[];
  onToggleSelected: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onAssignFolder: (folder: string) => void;
  onRemove: () => void;
  onPlay: ReturnType<typeof createPlayHandler>;
}

function WatchlistCard({
  item,
  layout,
  selectionMode,
  isSelected,
  isDragging,
  isMenuOpen,
  canDrag,
  folderOptions,
  onToggleSelected,
  onDragStart,
  onDragEnd,
  onMenuOpenChange,
  onAssignFolder,
  onRemove,
  onPlay
}: WatchlistCardProps) {
  const containerClass =
    layout === "grid"
      ? `relative transition-transform duration-150 ${
          selectionMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
        } ${isDragging ? "scale-[0.98] opacity-70" : ""} ${isMenuOpen ? "z-40" : ""} ${
          isSelected ? "rounded-lg ring-2 ring-primary" : ""
        }`
      : `group/listitem relative flex items-center gap-4 rounded-lg border p-3 transition-all duration-150 ${
          selectionMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
        } ${
          isSelected
            ? "border-primary/60 bg-primary/10"
            : "border-white/6 bg-white/4 hover:border-white/12 hover:bg-white/8"
        } ${isDragging ? "scale-[0.99] opacity-70" : ""} ${isMenuOpen ? "z-40" : ""}`;

  return (
    <div
      className={containerClass}
      draggable={canDrag && !selectionMode}
      onDragStart={() => {
        if (!canDrag || selectionMode) return;
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {selectionMode && (
        <button
          type="button"
          aria-label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSelected();
          }}
          className="absolute inset-0 z-30 rounded-lg"
        />
      )}

      {layout === "grid" ? (
        <>
          <div className="absolute left-2 top-2 z-50">
            {selectionMode ? (
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-md border-2 shadow-sm transition-colors ${
                  isSelected
                    ? "border-primary bg-primary text-white"
                    : "border-white/50 bg-black/60"
                }`}
              >
                {isSelected && <CheckSquare className="h-4 w-4" />}
              </div>
            ) : (
              <ItemActionsMenu
                folderOptions={folderOptions}
                isOpen={isMenuOpen}
                onOpenChange={onMenuOpenChange}
                onAssignFolder={onAssignFolder}
                onRemove={onRemove}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-md border border-white/12 bg-black/80 text-white/82 shadow-sm hover:bg-black hover:text-white"
                    aria-label={`Choose folder for ${item.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
            )}
          </div>
          <MovieCard
            content={item}
            onPlay={onPlay}
            layout="grid"
            suppressHoverEffects={isMenuOpen || selectionMode}
          />
        </>
      ) : (
        <div className="flex w-full min-w-0 items-center gap-4">
          {selectionMode && (
            <div
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
                isSelected ? "border-primary bg-primary text-white" : "border-white/30"
              }`}
            >
              {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
            </div>
          )}
          <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-white/6 sm:h-24 sm:w-16">
            <img
              src={item.posterUrl}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover/listitem:scale-105"
            />
            {!selectionMode && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 rounded-md bg-white text-black shadow-sm hover:bg-white/90"
                  aria-label={`Play ${item.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlay(
                      item.tmdbId!,
                      item.type === "tv" ? 1 : undefined,
                      item.type === "tv" ? 1 : undefined,
                      undefined,
                      undefined,
                      item.type
                    );
                  }}
                >
                  <Play className="h-3.5 w-3.5 shrink-0 fill-black text-black" />
                </Button>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="max-w-60 truncate text-base font-bold text-white sm:max-w-100">
                {item.title}
              </h3>
              <span className="rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-xs font-medium capitalize text-white/60">
                {item.type}
              </span>
            </div>
          </div>

          {!selectionMode && (
            <div className="flex shrink-0 items-center gap-2">
              <ItemActionsMenu
                folderOptions={folderOptions}
                isOpen={isMenuOpen}
                onOpenChange={onMenuOpenChange}
                onAssignFolder={onAssignFolder}
                onRemove={onRemove}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 rounded-md border border-white/12 bg-white/5 text-white/82 hover:bg-white/10 hover:text-white"
                    aria-label={`Choose folder for ${item.title}`}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FolderSection({
  name,
  items,
  layout,
  isCollapsed,
  onToggleCollapsed,
  isDropTarget,
  onDragOverSection,
  onDropSection,
  onRename,
  onDeleteRequest,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
  renderItem
}: {
  name: string;
  items: WatchlistGridItem[];
  layout: ViewLayout;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  isDropTarget: boolean;
  onDragOverSection: (e: React.DragEvent) => void;
  onDropSection: (e: React.DragEvent) => void;
  onRename: () => void;
  onDeleteRequest: () => void;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  renderItem: (item: WatchlistGridItem) => ReactNode;
}) {
  return (
    <section
      className={`space-y-4 rounded-lg border border-white/6 bg-white/2 p-4 transition-colors ${
        isDropTarget ? "border-white/18 bg-white/4" : ""
      }`}
      onDragOver={onDragOverSection}
      onDrop={onDropSection}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="flex items-center gap-2 rounded-md py-1 pr-2 text-left hover:opacity-80"
          onClick={onToggleCollapsed}
          aria-expanded={!isCollapsed}
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-white/40" />
          ) : (
            <ChevronDown className="h-4 w-4 text-white/40" />
          )}
          <Folder className="h-4 w-4 text-primary" />
          <h2 className="text-xl font-semibold text-white">{name}</h2>
          <span className="text-sm text-white/45">{items.length}</span>
        </button>
        {name !== "Unsorted" && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRename}
              className="rounded-md border border-white/10 bg-white/4 text-white/55 hover:border-white/25 hover:bg-white/10 hover:text-white"
              aria-label={`Rename ${name} folder`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDeleteRequest}
              className="rounded-md border border-white/10 bg-white/4 text-white/55 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
              aria-label={`Delete ${name} folder`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {!isCollapsed && (
        <>
          <div
            className={
              layout === "grid"
                ? "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                : "space-y-3"
            }
          >
            {items.map((item) => (
              <div key={item._id}>{renderItem(item)}</div>
            ))}
          </div>

          {canLoadMore && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="secondary"
                className="rounded-md"
                onClick={onLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading…" : "Load more items"}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function MyListPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const [folderFilter, setFolderFilter] = useState("all");

  useSeoMeta({
    title: "My List",
    description: "Your personal watchlist on FishyStream. Save movies and TV shows to watch later.",
    path: "/my-list",
    noIndex: true
  });

  const {
    items: watchlistData,
    allItems,
    canLoadMore,
    isLoadingMore,
    loadMore
  } = useMyWatchlistPagination(
    folderFilter === "all" ? undefined : folderFilter === "unsorted" ? null : folderFilter
  );
  const [watchlist, setWatchlist] = useState<typeof watchlistData>(undefined);
  const pendingFolderMoves = useRef<Map<ContentId, string | undefined>>(new Map());
  const updateFolder = useUpdateWatchlistFolder();
  const toggleWatchlistItem = useToggleWatchlist();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [newFolderName, setNewFolderName] = useState("");
  const [pendingFolderLoad, setPendingFolderLoad] = useState<string | null>(null);
  const [customFolders, setCustomFolders] = useState<string[]>(() =>
    getCustomFolders(user?.id ?? "guest")
  );
  const [draggedContentId, setDraggedContentId] = useState<ContentId | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<string | null>(null);
  const [isAutoSortDialogOpen, setIsAutoSortDialogOpen] = useState(false);
  const [folderMenuForContentId, setFolderMenuForContentId] = useState<ContentId | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>(() =>
    readStoredPref(
      SORT_PREF_KEY,
      "recently",
      SORT_OPTIONS.map((o) => o.id)
    )
  );
  const [viewLayout, setViewLayout] = useState<ViewLayout>(() =>
    readStoredPref(VIEW_PREF_KEY, "grid", ["grid", "list"] as const)
  );
  const [listTypeFilter, setListTypeFilter] = useState<TypeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 180);
  const [canDragCards, setCanDragCards] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<ContentId>>(() => new Set());
  const [isBulkMoving, setIsBulkMoving] = useState(false);
  const [pendingBulkRemove, setPendingBulkRemove] = useState(false);
  const [isBulkRemoving, setIsBulkRemoving] = useState(false);

  const [renameFolderTarget, setRenameFolderTarget] = useState<string | null>(null);
  const [renameFolderValue, setRenameFolderValue] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);

  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());

  const { recommendations, isLoading: recsLoading } = useRecommendations(
    12,
    typeFilter,
    refreshSeed,
    !!watchlistData?.length
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SORT_PREF_KEY, sortBy);
  }, [sortBy]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_PREF_KEY, viewLayout);
  }, [viewLayout]);

  useEffect(() => {
    if (!watchlistData) {
      setWatchlist(watchlistData);
      return;
    }
    setWatchlist(
      watchlistData.map((item) => {
        const pendingFolder = pendingFolderMoves.current.get(item._id);
        if (pendingFolder === undefined && !pendingFolderMoves.current.has(item._id)) return item;
        const serverFolder = item.watchlistFolder?.trim() || undefined;
        if (serverFolder === pendingFolder) {
          pendingFolderMoves.current.delete(item._id);
          return item;
        }
        return { ...item, watchlistFolder: pendingFolder };
      })
    );
  }, [watchlistData]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const update = () => setCanDragCards(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!watchlist) return;
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const validIds = new Set(watchlist.map((item) => item._id));
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [watchlist]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectionMode) exitSelectionMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectionMode]);

  const folderNames = useMemo(() => {
    if (!watchlist) return [];
    return Array.from(
      new Set([
        ...customFolders,
        ...allItems
          .map((item) => item.watchlistFolder?.trim())
          .filter((folder): folder is string => !!folder)
      ])
    ).sort((a, b) => a.localeCompare(b));
  }, [allItems, customFolders]);

  const folderOptions = useMemo(() => {
    const options = new Set(folderNames);
    const draftFolder = folderFilter.trim();
    if (draftFolder && draftFolder !== "all" && draftFolder !== "unsorted") {
      options.add(draftFolder);
    }
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [folderFilter, folderNames]);

  const filteredWatchlist = useMemo(() => {
    if (!watchlist) return [];
    const normalizedQuery = debouncedSearchQuery.trim().toLowerCase();
    return watchlist.filter((item) => {
      const matchesType = listTypeFilter === "all" || item.type === listTypeFilter;
      const itemFolder = item.watchlistFolder?.trim() || "";
      const matchesFolder =
        folderFilter === "all" ||
        (folderFilter === "unsorted" ? !itemFolder : itemFolder === folderFilter);
      const matchesSearch = !normalizedQuery || item.title.toLowerCase().includes(normalizedQuery);
      return matchesType && matchesFolder && matchesSearch;
    });
  }, [debouncedSearchQuery, folderFilter, listTypeFilter, watchlist]);

  const sortedFilteredWatchlist = useMemo(() => {
    const filtered = filteredWatchlist;
    const originalIndices = new Map(watchlist?.map((item, idx) => [item._id, idx]) ?? []);
    if (sortBy === "oldest") {
      return [...filtered].sort(
        (a, b) => (originalIndices.get(b._id) ?? 0) - (originalIndices.get(a._id) ?? 0)
      );
    }
    if (sortBy === "recently") {
      return [...filtered].sort(
        (a, b) => (originalIndices.get(a._id) ?? 0) - (originalIndices.get(b._id) ?? 0)
      );
    }
    if (sortBy === "title-az") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    return [...filtered].sort((a, b) => b.title.localeCompare(a.title));
  }, [filteredWatchlist, watchlist, sortBy]);

  const groupedWatchlist = useMemo(() => {
    const groups = new Map<string, WatchlistGridItem[]>();
    for (const item of sortedFilteredWatchlist) {
      const key = item.watchlistFolder?.trim() || "Unsorted";
      const current = groups.get(key);
      if (current) current.push(item);
      else groups.set(key, [item]);
    }
    return Array.from(groups.entries())
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => {
        if (a === "Unsorted") return 1;
        if (b === "Unsorted") return -1;
        return a.localeCompare(b);
      });
  }, [sortedFilteredWatchlist]);

  const allVisibleSelected =
    sortedFilteredWatchlist.length > 0 &&
    sortedFilteredWatchlist.every((item) => selectedIds.has(item._id));

  const persistCustomFolders = (folders: string[]) => {
    setCustomFolders(folders);
    setLSCustomFolders(user?.id ?? "guest", folders);
  };

  useEffect(() => {
    setCustomFolders(getCustomFolders(user?.id ?? "guest"));
  }, [user?.id]);

  useEffect(() => {
    if (!pendingFolderLoad || pendingFolderLoad !== folderFilter || !canLoadMore || isLoadingMore) {
      return;
    }
    setPendingFolderLoad(null);
    loadMore();
  }, [canLoadMore, folderFilter, isLoadingMore, loadMore, pendingFolderLoad]);

  const handlePlay = createPlayHandler(navigate, "movie");

  const handleRefresh = () => setRefreshSeed((prev) => prev + 1);

  const handleLoadMoreForFolder = (groupName: string) => {
    const targetFolder = groupName === "Unsorted" ? "unsorted" : groupName;
    if (folderFilter !== targetFolder) {
      setPendingFolderLoad(targetFolder);
      setFolderFilter(targetFolder);
      return;
    }
    loadMore();
  };

  const handleCreateFolder = () => {
    const normalized = newFolderName.trim();
    if (!normalized) return;
    if (folderNames.some((folder) => folder.toLowerCase() === normalized.toLowerCase())) {
      setFolderFilter(
        folderNames.find((folder) => folder.toLowerCase() === normalized.toLowerCase()) ??
          normalized
      );
      setNewFolderName("");
      toast.info("Folder already exists");
      return;
    }
    persistCustomFolders([...customFolders, normalized].sort((a, b) => a.localeCompare(b)));
    setFolderFilter(normalized);
    setNewFolderName("");
    toast.success(`Created folder "${normalized}"`);
  };

  const handleAssignFolder = async (
    contentId: ContentId,
    folderValue: string,
    options?: { silent?: boolean }
  ) => {
    if (!user) return false;
    const nextFolder = folderValue === "unsorted" ? undefined : folderValue;
    const previousFolder = watchlist?.find((item) => item._id === contentId)?.watchlistFolder;
    pendingFolderMoves.current.set(contentId, nextFolder);
    setWatchlist((current) =>
      current?.map((item) =>
        item._id === contentId ? { ...item, watchlistFolder: nextFolder } : item
      )
    );
    try {
      await updateFolder({ clerkUserId: user.id, contentId, folder: nextFolder });
      if (!options?.silent) {
        toast.success(folderValue === "unsorted" ? "Removed from folder" : "Folder updated");
      }
      return true;
    } catch {
      pendingFolderMoves.current.delete(contentId);
      setWatchlist((current) =>
        current?.map((item) =>
          item._id === contentId ? { ...item, watchlistFolder: previousFolder } : item
        )
      );
      if (!options?.silent) toast.error("Couldn't update folder");
      return false;
    }
  };

  const handleDeleteFolder = async (folderNameToDelete: string) => {
    if (!watchlist) return;
    const itemsInFolder = watchlist.filter(
      (item) => item.watchlistFolder?.trim() === folderNameToDelete
    );
    const results = await Promise.all(
      itemsInFolder.map((item) => handleAssignFolder(item._id, "unsorted", { silent: true }))
    );
    if (results.some((result) => !result)) {
      toast.error("Couldn't delete folder");
      return;
    }
    persistCustomFolders(customFolders.filter((folder) => folder !== folderNameToDelete));
    if (folderFilter === folderNameToDelete) setFolderFilter("all");
    toast.success(`Deleted folder "${folderNameToDelete}"`);
  };

  const handleAutoSortFolders = async () => {
    if (!watchlist) return;
    const neededFolders = ["Movies", "TV Shows"];
    persistCustomFolders(
      Array.from(new Set([...customFolders, ...neededFolders])).sort((a, b) => a.localeCompare(b))
    );
    const results = await Promise.all(
      watchlist.map((item) =>
        handleAssignFolder(item._id, item.type === "movie" ? "Movies" : "TV Shows", {
          silent: true
        })
      )
    );
    if (results.some((result) => !result)) {
      toast.error("Couldn't auto sort everything");
      return;
    }
    toast.success("Sorted your list into Movies and TV Shows");
  };

  const handleDropToFolder = async (folderValue: string) => {
    if (!draggedContentId) return;
    await handleAssignFolder(draggedContentId, folderValue);
    setDraggedContentId(null);
  };

  const handleRemoveItem = async (item: WatchlistGridItem) => {
    try {
      await toggleWatchlistItem(item._id, itemToSnapshot(item));
      toast.success(`Removed "${item.title}" from your list`);
    } catch {
      toast.error("Couldn't remove that title");
    }
  };

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleItemSelected(id: ContentId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAllToggle() {
    setSelectedIds(
      allVisibleSelected ? new Set() : new Set(sortedFilteredWatchlist.map((item) => item._id))
    );
  }

  async function handleBulkMove(folderValue: string) {
    if (selectedIds.size === 0) return;
    setIsBulkMoving(true);
    const ids = [...selectedIds];
    const results = await Promise.all(
      ids.map((id) => handleAssignFolder(id, folderValue, { silent: true }))
    );
    setIsBulkMoving(false);
    if (results.some((ok) => !ok)) {
      toast.error("Couldn't move everything");
      return;
    }
    toast.success(
      folderValue === "unsorted"
        ? `Moved ${pluralize(ids.length, "title")} to Unsorted`
        : `Moved ${pluralize(ids.length, "title")} to "${folderValue}"`
    );
    exitSelectionMode();
  }

  async function handleBulkRemove() {
    if (selectedIds.size === 0 || !watchlist) return;
    setIsBulkRemoving(true);
    const targets = watchlist.filter((item) => selectedIds.has(item._id));
    try {
      await Promise.all(targets.map((item) => toggleWatchlistItem(item._id, itemToSnapshot(item))));
      toast.success(`Removed ${pluralize(targets.length, "title")} from your list`);
      exitSelectionMode();
    } catch {
      toast.error("Couldn't remove everything");
    } finally {
      setIsBulkRemoving(false);
      setPendingBulkRemove(false);
    }
  }

  function openRenameFolder(name: string) {
    setRenameFolderTarget(name);
    setRenameFolderValue(name);
  }

  async function handleRenameFolder() {
    if (!renameFolderTarget || !watchlist) return;
    const normalized = renameFolderValue.trim();
    if (!normalized || normalized === renameFolderTarget) {
      setRenameFolderTarget(null);
      return;
    }
    if (folderNames.some((f) => f.toLowerCase() === normalized.toLowerCase())) {
      toast.error("A folder with that name already exists");
      return;
    }
    setIsRenamingFolder(true);
    const itemsInFolder = watchlist.filter(
      (item) => item.watchlistFolder?.trim() === renameFolderTarget
    );
    const results = await Promise.all(
      itemsInFolder.map((item) => handleAssignFolder(item._id, normalized, { silent: true }))
    );
    setIsRenamingFolder(false);
    if (results.some((ok) => !ok)) {
      toast.error("Couldn't rename that folder");
      return;
    }
    persistCustomFolders(
      Array.from(
        new Set(customFolders.filter((f) => f !== renameFolderTarget).concat(normalized))
      ).sort((a, b) => a.localeCompare(b))
    );
    if (folderFilter === renameFolderTarget) setFolderFilter(normalized);
    setRenameFolderTarget(null);
    toast.success(`Renamed to "${normalized}"`);
  }

  function toggleFolderCollapsed(name: string) {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  if (watchlist === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="page-shell-wide page-stack">
          <GridSkeleton />
        </div>
      </div>
    );
  }

  const hasAnyItems = watchlist.length > 0;
  const isFolderOnlyEmpty =
    filteredWatchlist.length === 0 &&
    folderFilter !== "all" &&
    !searchQuery &&
    listTypeFilter === "all";

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="page-shell-wide page-stack pb-28">
        <PageHeader
          title="My List"
          actions={
            <Button variant="secondary" className="rounded-md" onClick={() => navigate("/movies")}>
              Browse
            </Button>
          }
        />

        {!hasAnyItems && folderFilter === "all" ? (
          <EmptyState
            title="No saved titles"
            action={
              <Button className="rounded-md" onClick={() => navigate("/movies")}>
                Browse movies
              </Button>
            }
          />
        ) : (
          <div className="space-y-8">
            <section className="space-y-4 border-y border-white/8 py-4">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <BookMarked className="h-4 w-4 shrink-0 text-primary" />
                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
                    <Button
                      variant={folderFilter === "all" ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setFolderFilter("all")}
                      className="rounded-md"
                    >
                      All <span className="ml-1 opacity-60">{allItems.length}</span>
                    </Button>
                    <Button
                      variant={folderFilter === "unsorted" ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setFolderFilter("unsorted")}
                      className="rounded-md"
                    >
                      Unsorted
                      <span className="ml-1 opacity-60">
                        {allItems.filter((item) => !item.watchlistFolder?.trim()).length}
                      </span>
                    </Button>
                    {folderNames.map((folder) => (
                      <div
                        key={folder}
                        className={`flex items-center overflow-hidden rounded-md text-sm transition-colors ${
                          folderFilter === folder
                            ? "bg-primary text-white"
                            : "bg-white/8 text-white/70 hover:bg-white/14"
                        }`}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setFolderFilter(folder)}
                          className="rounded-none px-3 py-1.5 text-inherit hover:bg-transparent hover:text-inherit"
                        >
                          {folder}
                          <span className="ml-1 opacity-60">
                            {
                              allItems.filter((item) => item.watchlistFolder?.trim() === folder)
                                .length
                            }
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRenameFolder(folder);
                          }}
                          className={`rounded-none px-2 py-1.5 ${
                            folderFilter === folder ? "hover:bg-black/20" : "hover:bg-white/8"
                          }`}
                          aria-label={`Rename ${folder} folder`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteFolder(folder);
                          }}
                          className={`rounded-none px-2 py-1.5 ${
                            folderFilter === folder
                              ? "bg-black/12 hover:bg-black/20"
                              : "hover:bg-white/8"
                          }`}
                          aria-label={`Delete ${folder} folder`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    variant="secondary"
                    className="rounded-md"
                    onClick={() => setIsAutoSortDialogOpen(true)}
                    aria-label="Organize into folders"
                  >
                    <Folder className="mr-2 h-4 w-4" />
                    Organize
                  </Button>
                  <div className="relative flex-1">
                    <FolderPlus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                    <Input
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleCreateFolder();
                        }
                      }}
                      placeholder="New folder"
                      className="min-w-0 rounded-md border-white/12 bg-white/6 pl-10 text-white placeholder:text-white/35 sm:w-56"
                    />
                  </div>
                  <Button className="shrink-0 rounded-md" onClick={handleCreateFolder}>
                    Create
                  </Button>
                </div>
              </div>
            </section>

            <div className="sticky top-16 z-30 -mx-4 flex flex-col gap-3 border-b border-white/8 bg-background/95 px-4 pb-4 pt-2 backdrop-blur supports-backdrop-blur:bg-background/75 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search your list"
                    aria-label="Search your list"
                    className="h-10 rounded-md border-white/10 bg-white/5 pl-9 pr-9 text-white placeholder:text-white/40"
                  />
                  {searchQuery && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 rounded-md text-white/50 hover:text-white"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <Tabs
                  value={listTypeFilter}
                  onValueChange={(value) => setListTypeFilter(value as TypeFilter)}
                >
                  <TabsList className="h-10 rounded-md bg-white/5 p-1">
                    <TabsTrigger
                      value="all"
                      className="rounded-sm px-3 text-xs data-selected:bg-white data-selected:text-black"
                    >
                      All
                    </TabsTrigger>
                    <TabsTrigger
                      value="movie"
                      className="rounded-sm px-3 text-xs data-selected:bg-white data-selected:text-black"
                    >
                      Movies
                    </TabsTrigger>
                    <TabsTrigger
                      value="tv"
                      className="rounded-sm px-3 text-xs data-selected:bg-white data-selected:text-black"
                    >
                      TV
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-white/50">{filteredWatchlist.length}</div>

                {user && (
                  <Button
                    type="button"
                    variant={selectionMode ? "default" : "secondary"}
                    size="sm"
                    className="rounded-md"
                    onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
                  >
                    {selectionMode ? (
                      <CheckSquare className="mr-1.5 h-4 w-4" />
                    ) : (
                      <Square className="mr-1.5 h-4 w-4" />
                    )}
                    {selectionMode ? "Done" : "Select"}
                  </Button>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="secondary"
                        size="icon"
                        className="rounded-md border border-white/8 bg-white/6 hover:bg-white/12"
                        aria-label="Sort"
                        title={SORT_OPTIONS.find((o) => o.id === sortBy)?.label}
                      >
                        <ArrowDownUp className="h-4 w-4" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent className="mt-2 w-48 rounded-lg border border-white/10 bg-popover p-1 shadow-md">
                    {SORT_OPTIONS.map((option) => (
                      <DropdownMenuItem
                        key={option.id}
                        className={`rounded-md px-3 py-2 text-xs font-medium focus:bg-white focus:text-black ${
                          sortBy === option.id ? "bg-white/10 text-white" : "text-white/70"
                        }`}
                        onClick={() => setSortBy(option.id)}
                      >
                        {option.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex items-center rounded-md border border-white/8 bg-white/4 p-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-md ${
                      viewLayout === "grid"
                        ? "bg-white text-black hover:bg-white hover:text-black"
                        : "text-white/60 hover:text-white"
                    }`}
                    onClick={() => setViewLayout("grid")}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-8 w-8 rounded-md ${
                      viewLayout === "list"
                        ? "bg-white text-black hover:bg-white hover:text-black"
                        : "text-white/60 hover:text-white"
                    }`}
                    onClick={() => setViewLayout("list")}
                    aria-label="List view"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {isFolderOnlyEmpty ? null : filteredWatchlist.length === 0 ? (
              <EmptyState
                title={
                  searchQuery ? `No titles match "${searchQuery}"` : "No titles match these filters"
                }
                action={
                  <Button
                    variant="secondary"
                    className="rounded-md"
                    onClick={() => {
                      setSearchQuery("");
                      setListTypeFilter("all");
                      setFolderFilter("all");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              groupedWatchlist.map(([groupName, items]) => (
                <FolderSection
                  key={groupName}
                  name={groupName}
                  items={items}
                  layout={viewLayout}
                  isCollapsed={collapsedFolders.has(groupName)}
                  onToggleCollapsed={() => toggleFolderCollapsed(groupName)}
                  isDropTarget={!!draggedContentId}
                  onDragOverSection={(e) => e.preventDefault()}
                  onDropSection={async (e) => {
                    e.preventDefault();
                    await handleDropToFolder(groupName === "Unsorted" ? "unsorted" : groupName);
                  }}
                  onRename={() => openRenameFolder(groupName)}
                  onDeleteRequest={() => setPendingDeleteFolder(groupName)}
                  canLoadMore={canLoadMore}
                  isLoadingMore={isLoadingMore}
                  onLoadMore={() => handleLoadMoreForFolder(groupName)}
                  renderItem={(item) => (
                    <WatchlistCard
                      item={item}
                      layout={viewLayout}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(item._id)}
                      isDragging={draggedContentId === item._id}
                      isMenuOpen={folderMenuForContentId === item._id}
                      canDrag={canDragCards}
                      folderOptions={folderOptions}
                      onToggleSelected={() => toggleItemSelected(item._id)}
                      onDragStart={() => setDraggedContentId(item._id)}
                      onDragEnd={() => setDraggedContentId(null)}
                      onMenuOpenChange={(open) => setFolderMenuForContentId(open ? item._id : null)}
                      onAssignFolder={async (folder) => {
                        await handleAssignFolder(item._id, folder);
                        setFolderMenuForContentId(null);
                      }}
                      onRemove={async () => {
                        setFolderMenuForContentId(null);
                        await handleRemoveItem(item);
                      }}
                      onPlay={handlePlay}
                    />
                  )}
                />
              ))
            )}
          </div>
        )}

        {watchlist.length > 0 && (
          <div className="mt-16">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold text-white">Recommended</h2>
              </div>

              <Tabs
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as TypeFilter)}
              >
                <TabsList className="h-auto rounded-xl bg-white/6 p-1">
                  <TabsTrigger
                    value="all"
                    className="rounded-lg data-selected:bg-white data-selected:text-black"
                  >
                    All
                  </TabsTrigger>
                  <TabsTrigger
                    value="movie"
                    className="rounded-lg data-selected:bg-white data-selected:text-black"
                  >
                    <Film className="h-3.5 w-3.5" />
                  </TabsTrigger>
                  <TabsTrigger
                    value="tv"
                    className="rounded-lg data-selected:bg-white data-selected:text-black"
                  >
                    <Tv className="h-3.5 w-3.5" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={recsLoading}
                className="self-start rounded-md text-white/60 hover:text-white sm:ml-auto"
                aria-label="Refresh recommendations"
              >
                <RefreshCw className={`h-4 w-4 ${recsLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {recommendations.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {recommendations.map((item) => (
                  <MovieCard key={item._id} content={item} onPlay={handlePlay} layout="grid" />
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/40">No recommendations yet</p>
            )}
          </div>
        )}
      </main>

      {/* Floating bulk-action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-white/10 bg-[hsl(220,20%,10%)] p-2 shadow-2xl">
            <div className="flex items-center gap-2 pl-2 pr-1 text-sm font-medium text-white">
              {pluralize(selectedIds.size, "selected")}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-md text-white/70 hover:text-white"
              onClick={handleSelectAllToggle}
            >
              {allVisibleSelected ? "Clear" : "Select all"}
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="secondary"
                      size="sm"
                      className="rounded-md"
                      disabled={isBulkMoving}
                    >
                      <Folder className="mr-2 h-4 w-4" />
                      Move to
                    </Button>
                  }
                />
                <DropdownMenuContent className="mb-2 w-56 rounded-lg border border-white/10 bg-popover p-1 shadow-md">
                  <FolderPickerItems folderOptions={folderOptions} onSelect={handleBulkMove} />
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="destructive"
                size="sm"
                className="rounded-md"
                onClick={() => setPendingBulkRemove(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Remove
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md text-white/60 hover:text-white"
                onClick={exitSelectionMode}
                aria-label="Cancel selection"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={isAutoSortDialogOpen} onOpenChange={setIsAutoSortDialogOpen}>
        <DialogContent className="border-white/10 bg-[hsl(220,20%,8%)] text-white">
          <DialogHeader>
            <DialogTitle>Organize your list?</DialogTitle>
            <DialogDescription className="text-white/58">
              Movies go to "Movies" and TV shows go to "TV Shows". Items already sorted elsewhere
              will move.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsAutoSortDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                setIsAutoSortDialogOpen(false);
                await handleAutoSortFolders();
              }}
            >
              Organize
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!pendingDeleteFolder}
        onOpenChange={(open) => !open && setPendingDeleteFolder(null)}
      >
        <DialogContent className="border-white/10 bg-[hsl(220,20%,8%)] text-white">
          <DialogHeader>
            <DialogTitle>Delete folder?</DialogTitle>
            <DialogDescription className="text-white/58">
              {pendingDeleteFolder
                ? `"${pendingDeleteFolder}" will be removed. Its titles move back to Unsorted.`
                : "Are you sure?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDeleteFolder(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!pendingDeleteFolder) return;
                const folderToDelete = pendingDeleteFolder;
                setPendingDeleteFolder(null);
                await handleDeleteFolder(folderToDelete);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingBulkRemove}
        onOpenChange={(open) => !open && setPendingBulkRemove(false)}
      >
        <DialogContent className="border-white/10 bg-[hsl(220,20%,8%)] text-white">
          <DialogHeader>
            <DialogTitle>Remove {pluralize(selectedIds.size, "title")}?</DialogTitle>
            <DialogDescription className="text-white/58">
              These titles will be removed from your list. You can always add them back later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingBulkRemove(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={isBulkRemoving} onClick={handleBulkRemove}>
              {isBulkRemoving ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameFolderTarget}
        onOpenChange={(open) => !open && setRenameFolderTarget(null)}
      >
        <DialogContent className="border-white/10 bg-[hsl(220,20%,8%)] text-white">
          <DialogHeader>
            <DialogTitle>Rename folder</DialogTitle>
            <DialogDescription className="text-white/58">
              Titles inside "{renameFolderTarget}" will move to the new name.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameFolderValue}
            onChange={(e) => setRenameFolderValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleRenameFolder();
              }
            }}
            placeholder="Folder name"
            autoFocus
            className="rounded-md border-white/12 bg-white/6 text-white placeholder:text-white/35"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameFolderTarget(null)}>
              Cancel
            </Button>
            <Button disabled={isRenamingFolder} onClick={handleRenameFolder}>
              {isRenamingFolder ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
