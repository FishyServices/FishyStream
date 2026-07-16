import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/hooks/useSeoMeta";
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
  X
} from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/components/UXPrimitives";
import { useMyWatchlist, useUpdateWatchlistFolder } from "@/hooks/useWatchlist";
import { useUser } from "@clerk/react";
import { useRecommendations } from "@/hooks/useContent";
import { createPlayHandler } from "@/lib/watchNavigation";
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
import type { ContentId } from "../../shared/contentMetadata";
import { getCustomFolders, setCustomFolders as setLSCustomFolders } from "@/lib/localStorageStore";

const SORT_OPTIONS = [
  { id: "recently", label: "Recently added" },
  { id: "oldest", label: "Oldest added" },
  { id: "title-az", label: "Title A → Z" },
  { id: "title-za", label: "Title Z → A" }
] as const;

export function MyListPage() {
  const navigate = useNavigate();
  const { user } = useUser();

  useSeoMeta({
    title: "My List",
    description: "Your personal watchlist on FishyStream. Save movies and TV shows to watch later.",
    path: "/my-list",
    noIndex: true
  });
  const watchlistData = useMyWatchlist();
  const [watchlist, setWatchlist] = useState<typeof watchlistData>(undefined);
  const updateFolder = useUpdateWatchlistFolder();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [folderFilter, setFolderFilter] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [customFolders, setCustomFolders] = useState<string[]>(() => {
    return getCustomFolders(user?.id ?? "guest");
  });
  const [draggedContentId, setDraggedContentId] = useState<ContentId | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<string | null>(null);
  const [isAutoSortDialogOpen, setIsAutoSortDialogOpen] = useState(false);
  const [folderMenuForContentId, setFolderMenuForContentId] = useState<ContentId | null>(null);
  const [sortBy, setSortBy] = useState<"recently" | "oldest" | "title-az" | "title-za">("recently");
  const [viewLayout, setViewLayout] = useState<"grid" | "list">("grid");
  const [listTypeFilter, setListTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [canDragCards, setCanDragCards] = useState(false);
  const { recommendations, isLoading: recsLoading } = useRecommendations(
    12,
    typeFilter,
    refreshSeed,
    !!watchlistData?.length
  );

  useEffect(() => {
    setWatchlist(watchlistData);
  }, [watchlistData]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia("(min-width: 768px) and (pointer: fine)");
    const update = () => setCanDragCards(mediaQuery.matches);
    update();

    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const folderNames = useMemo(() => {
    if (!watchlist) return [];
    return Array.from(
      new Set([
        ...customFolders,
        ...watchlist
          .map((item) => item.watchlistFolder?.trim())
          .filter((folder): folder is string => !!folder)
      ])
    ).sort((a, b) => a.localeCompare(b));
  }, [customFolders, watchlist]);

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
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return watchlist.filter((item) => {
      const matchesType = listTypeFilter === "all" || item.type === listTypeFilter;
      const itemFolder = item.watchlistFolder?.trim() || "";
      const matchesFolder =
        folderFilter === "all" ||
        (folderFilter === "unsorted" ? !itemFolder : itemFolder === folderFilter);
      const matchesSearch = !normalizedQuery || item.title.toLowerCase().includes(normalizedQuery);
      return matchesType && matchesFolder && matchesSearch;
    });
  }, [folderFilter, listTypeFilter, searchQuery, watchlist]);

  const sortedFilteredWatchlist = useMemo(() => {
    const filtered = filteredWatchlist;
    if (sortBy === "oldest") {
      const originalIndices = new Map(watchlist?.map((item, idx) => [item._id, idx]) ?? []);
      return [...filtered].sort((a, b) => {
        const aIdx = originalIndices.get(a._id) ?? 0;
        const bIdx = originalIndices.get(b._id) ?? 0;
        return bIdx - aIdx;
      });
    }
    if (sortBy === "recently") {
      const originalIndices = new Map(watchlist?.map((item, idx) => [item._id, idx]) ?? []);
      return [...filtered].sort((a, b) => {
        const aIdx = originalIndices.get(a._id) ?? 0;
        const bIdx = originalIndices.get(b._id) ?? 0;
        return aIdx - bIdx;
      });
    }
    if (sortBy === "title-az") {
      return [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    }
    if (sortBy === "title-za") {
      return [...filtered].sort((a, b) => b.title.localeCompare(a.title));
    }
    return filtered;
  }, [filteredWatchlist, watchlist, sortBy]);

  const groupedWatchlist = useMemo(() => {
    const groups = new Map<string, typeof filteredWatchlist>();
    for (const folder of folderNames) {
      groups.set(folder, []);
    }
    for (const item of sortedFilteredWatchlist) {
      const key = item.watchlistFolder?.trim() || "Unsorted";
      const current = groups.get(key);
      if (current) {
        current.push(item);
      } else {
        groups.set(key, [item]);
      }
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "Unsorted") return 1;
      if (b === "Unsorted") return -1;
      return a.localeCompare(b);
    });
  }, [sortedFilteredWatchlist, folderNames]);

  const persistCustomFolders = (folders: string[]) => {
    setCustomFolders(folders);
    setLSCustomFolders(user?.id ?? "guest", folders);
  };

  useEffect(() => {
    setCustomFolders(getCustomFolders(user?.id ?? "guest"));
  }, [user?.id]);

  const handlePlay = createPlayHandler(navigate, "movie");

  const handleRefresh = () => {
    setRefreshSeed((prev) => prev + 1);
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
    try {
      await updateFolder({
        clerkUserId: user.id,
        contentId,
        folder: folderValue === "unsorted" ? undefined : folderValue
      });
      setWatchlist((current) =>
        current?.map((item) =>
          item._id === contentId
            ? { ...item, watchlistFolder: folderValue === "unsorted" ? undefined : folderValue }
            : item
        )
      );
      if (!options?.silent) {
        toast.success(folderValue === "unsorted" ? "Removed from folder" : "Folder updated");
      }
      return true;
    } catch {
      if (!options?.silent) {
        toast.error("Couldn't update folder");
      }
      return false;
    }
  };

  const handleDeleteFolder = async (folderName: string) => {
    if (!watchlist) return;

    const itemsInFolder = watchlist.filter((item) => item.watchlistFolder?.trim() === folderName);

    const results = await Promise.all(
      itemsInFolder.map((item) => handleAssignFolder(item._id, "unsorted", { silent: true }))
    );

    if (results.some((result) => !result)) {
      toast.error("Couldn't delete folder");
      return;
    }

    persistCustomFolders(customFolders.filter((folder) => folder !== folderName));
    if (folderFilter === folderName) {
      setFolderFilter("all");
    }
    toast.success(`Deleted folder "${folderName}"`);
  };

  const handleAutoSortFolders = async () => {
    if (!watchlist) return;

    const neededFolders = ["Movies", "TV Shows"];
    const nextCustomFolders = Array.from(new Set([...customFolders, ...neededFolders])).sort(
      (a, b) => a.localeCompare(b)
    );
    persistCustomFolders(nextCustomFolders);

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

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="page-shell-wide page-stack">
        <PageHeader
          title="My List"
          count={watchlist.length}
          actions={
            <Button variant="secondary" className="rounded-md" onClick={() => navigate("/movies")}>
              Browse
            </Button>
          }
        />

        {watchlist.length === 0 ? (
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
                      All <span className="ml-1 opacity-60">{watchlist.length}</span>
                    </Button>
                    <Button
                      variant={folderFilter === "unsorted" ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setFolderFilter("unsorted")}
                      className="rounded-md"
                    >
                      Unsorted
                      <span className="ml-1 opacity-60">
                        {watchlist.filter((item) => !item.watchlistFolder?.trim()).length}
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
                              watchlist.filter((item) => item.watchlistFolder?.trim() === folder)
                                .length
                            }
                          </span>
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDeleteFolder(folder)}
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

            <div className="flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-center lg:justify-between">
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
                  onValueChange={(value) => setListTypeFilter(value as typeof listTypeFilter)}
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

            {filteredWatchlist.length === 0 ? (
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
                <section
                  key={groupName}
                  className={`space-y-4 rounded-lg border border-white/6 bg-white/2 p-4 ${
                    draggedContentId ? "border-white/18 bg-white/4" : ""
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                  }}
                  onDrop={async (e) => {
                    e.preventDefault();
                    await handleDropToFolder(groupName === "Unsorted" ? "unsorted" : groupName);
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 text-primary" />
                        <h2 className="text-xl font-semibold text-white">{groupName}</h2>
                        <span className="text-sm text-white/45">{items.length}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {groupName !== "Unsorted" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDeleteFolder(groupName)}
                          className="rounded-md border border-white/10 bg-white/4 text-white/55 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
                          aria-label={`Delete ${groupName} folder`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div
                    className={
                      viewLayout === "grid"
                        ? "grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
                        : "space-y-3"
                    }
                  >
                    {items.map((item) => (
                      <div
                        key={item._id}
                        className={
                          viewLayout === "grid"
                            ? `relative cursor-grab active:cursor-grabbing transition-transform ${
                                draggedContentId === item._id ? "scale-[0.98] opacity-70" : ""
                              } ${folderMenuForContentId === item._id ? "z-40" : ""}`
                            : `relative cursor-grab active:cursor-grabbing flex items-center gap-4 p-3 rounded-lg border border-white/6 bg-white/4 hover:bg-white/8 hover:border-white/12 transition-all ${
                                draggedContentId === item._id ? "scale-[0.99] opacity-70" : ""
                              } ${folderMenuForContentId === item._id ? "z-40" : ""}`
                        }
                        draggable={canDragCards}
                        onDragStart={() => {
                          if (!canDragCards) return;
                          setDraggedContentId(item._id);
                        }}
                        onDragEnd={() => setDraggedContentId(null)}
                      >
                        {viewLayout === "grid" ? (
                          <>
                            <div className="absolute left-2 top-2 z-50">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 rounded-md border border-white/12 bg-black/80 text-white/82 shadow-sm hover:bg-black hover:text-white"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setFolderMenuForContentId((current) =>
                                    current === item._id ? null : item._id
                                  );
                                }}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                aria-label={`Choose folder for ${item.title}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                              {folderMenuForContentId === item._id && (
                                <div
                                  className="absolute left-0 top-11 z-50 w-56 rounded-lg border border-white/10 bg-popover p-1 shadow-md"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                  }}
                                >
                                  <Button
                                    variant="ghost"
                                    className="w-full justify-start rounded-md px-3 py-2 text-white/72 hover:bg-white/6 hover:text-white"
                                    onClick={async () => {
                                      await handleAssignFolder(item._id, "unsorted");
                                      setFolderMenuForContentId(null);
                                    }}
                                  >
                                    Unsorted
                                  </Button>
                                  {folderOptions.map((folder) => (
                                    <Button
                                      key={folder}
                                      variant="ghost"
                                      className="w-full justify-start rounded-md px-3 py-2 text-white/72 hover:bg-white/6 hover:text-white"
                                      onClick={async () => {
                                        await handleAssignFolder(item._id, folder);
                                        setFolderMenuForContentId(null);
                                      }}
                                    >
                                      {folder}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <MovieCard
                              content={item}
                              onPlay={handlePlay}
                              layout="grid"
                              suppressHoverEffects={folderMenuForContentId === item._id}
                            />
                          </>
                        ) : (
                          <div className="flex w-full min-w-0 items-center gap-4">
                            <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-white/6 sm:h-24 sm:w-16">
                              <img
                                src={item.posterUrl}
                                alt={item.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover/listitem:scale-105"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 rounded-md bg-white text-black shadow-sm hover:bg-white/90"
                                  aria-label={`Play ${item.title}`}
                                  onClick={() =>
                                    handlePlay(
                                      item.tmdbId!,
                                      item.type === "tv" ? 1 : undefined,
                                      item.type === "tv" ? 1 : undefined,
                                      undefined,
                                      undefined,
                                      item.type
                                    )
                                  }
                                >
                                  <Play className="h-3.5 w-3.5 shrink-0 fill-black text-black" />
                                </Button>
                              </div>
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

                            <div className="flex shrink-0 items-center gap-2">
                              <div className="relative">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 rounded-md border border-white/12 bg-white/5 text-white/82 hover:bg-white/10 hover:text-white"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setFolderMenuForContentId((current) =>
                                      current === item._id ? null : item._id
                                    );
                                  }}
                                  aria-label={`Choose folder for ${item.title}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                {folderMenuForContentId === item._id && (
                                  <div
                                    className="absolute right-0 top-11 z-50 w-56 rounded-lg border border-white/10 bg-popover p-1 shadow-md"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                  >
                                    <Button
                                      variant="ghost"
                                      className="w-full justify-start rounded-md px-3 py-2 text-white/72 hover:bg-white/6 hover:text-white"
                                      onClick={async () => {
                                        await handleAssignFolder(item._id, "unsorted");
                                        setFolderMenuForContentId(null);
                                      }}
                                    >
                                      Unsorted
                                    </Button>
                                    {folderOptions.map((folder) => (
                                      <Button
                                        key={folder}
                                        variant="ghost"
                                        className="w-full justify-start rounded-md px-3 py-2 text-white/72 hover:bg-white/6 hover:text-white"
                                        onClick={async () => {
                                          await handleAssignFolder(item._id, folder);
                                          setFolderMenuForContentId(null);
                                        }}
                                      >
                                        {folder}
                                      </Button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
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
                onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
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
    </div>
  );
}
