import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  Sparkles,
  RefreshCw,
  Film,
  Tv,
  BookMarked,
  FolderPlus,
  Folder,
  Trash2
} from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useMyWatchlist, useUpdateWatchlistFolder } from "@/hooks/useWatchlist";
import { useUser } from "@clerk/react";
import { useRecommendations } from "@/hooks/useContent";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast
} from "@fishy/ui";
import type { Id } from "../../convex/_generated/dataModel";

export function MyListPage() {
  const navigate = useNavigate();
  const { isSignedIn, user } = useUser();
  const customFolderKey = `watchlist_custom_folders_${user?.id ?? "guest"}`;
  const watchlist = useMyWatchlist();
  const updateFolder = useUpdateWatchlistFolder();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const [folderFilter, setFolderFilter] = useState("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [customFolders, setCustomFolders] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(`watchlist_custom_folders_guest`);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [draggedContentId, setDraggedContentId] = useState<Id<"content"> | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    contentId: Id<"content">;
    title: string;
  } | null>(null);
  const { recommendations, isLoading: recsLoading } = useRecommendations(
    watchlist,
    12,
    typeFilter,
    refreshSeed
  );

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
    return watchlist.filter((item) => {
      const matchesType = typeFilter === "all" || item.type === typeFilter;
      const itemFolder = item.watchlistFolder?.trim() || "";
      const matchesFolder =
        folderFilter === "all" ||
        (folderFilter === "unsorted" ? !itemFolder : itemFolder === folderFilter);
      return matchesType && matchesFolder;
    });
  }, [folderFilter, typeFilter, watchlist]);

  const groupedWatchlist = useMemo(() => {
    const groups = new Map<string, typeof filteredWatchlist>();
    for (const folder of folderNames) {
      groups.set(folder, []);
    }
    for (const item of filteredWatchlist) {
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
  }, [filteredWatchlist, folderNames]);

  const persistCustomFolders = (folders: string[]) => {
    setCustomFolders(folders);
    try {
      localStorage.setItem(customFolderKey, JSON.stringify(folders));
    } catch {}
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(customFolderKey);
      setCustomFolders(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      setCustomFolders([]);
    }
  }, [customFolderKey]);

  const handlePlay = (tmdbId: string) => {
    navigate(`/watch/${tmdbId}`);
  };

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
    contentId: Id<"content">,
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

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-2">My List</h1>
            <p className="text-white/60">Please sign in to view your watchlist.</p>
          </div>
        </div>
      </div>
    );
  }

  if (watchlist === undefined) {
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
        <h1 className="text-3xl font-bold text-white mb-8">My List</h1>

        {watchlist.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60">
              Your watchlist is empty. Add movies and shows to watch later.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            <section className="rounded-3xl border border-white/8 bg-white/4 p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <BookMarked className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium text-white">Bookmarks & folders</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={folderFilter === "all" ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setFolderFilter("all")}
                      className="rounded-full"
                    >
                      All ({watchlist.length})
                    </Button>
                    <Button
                      variant={folderFilter === "unsorted" ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setFolderFilter("unsorted")}
                      className="rounded-full"
                    >
                      Unsorted ({watchlist.filter((item) => !item.watchlistFolder?.trim()).length})
                    </Button>
                    {folderNames.map((folder) => (
                      <div
                        key={folder}
                        className={`flex items-center overflow-hidden rounded-full text-sm transition-colors ${
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
                          {folder} (
                          {
                            watchlist.filter((item) => item.watchlistFolder?.trim() === folder)
                              .length
                          }
                          )
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
                          title={`Delete ${folder} folder`}
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
                    className="rounded-full"
                    onClick={() => void handleAutoSortFolders()}
                  >
                    Auto Sort
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
                      placeholder="Create a folder like Anime or Friday Night"
                      className="min-w-0 rounded-full border-white/12 bg-white/6 pl-10 text-white placeholder:text-white/35 sm:w-80"
                    />
                  </div>
                  <Button className="rounded-full" onClick={handleCreateFolder}>
                    Add Folder
                  </Button>
                </div>
              </div>
            </section>

            {filteredWatchlist.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/3 px-6 py-12 text-center">
                <p className="text-white/58">No saved titles match this folder filter yet.</p>
              </div>
            ) : (
              groupedWatchlist.map(([groupName, items]) => (
                <section
                  key={groupName}
                  className="space-y-4 rounded-[1.75rem] border border-white/6 bg-white/[0.02] p-4"
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
                      </div>
                      <p className="text-sm text-white/45">
                        {items.length} saved {items.length === 1 ? "title" : "titles"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-white/35">Drop titles here</div>
                      {groupName !== "Unsorted" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setPendingDeleteFolder(groupName)}
                          className="rounded-full border border-white/10 bg-white/4 text-white/55 transition-colors hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
                          aria-label={`Delete ${groupName} folder`}
                          title={`Delete ${groupName} folder`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {items.map((item) => (
                      <div
                        key={item._id}
                        className={`relative cursor-grab active:cursor-grabbing transition-transform ${draggedContentId === item._id ? "scale-[0.98] opacity-70" : ""}`}
                        draggable
                        onDragStart={() => {
                          setDraggedContentId(item._id);
                          setContextMenu(null);
                        }}
                        onDragEnd={() => setDraggedContentId(null)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            contentId: item._id,
                            title: item.title
                          });
                        }}
                      >
                        <MovieCard content={item} onPlay={handlePlay} layout="grid" />
                        {(item.watchlistNewSeasons > 0 || item.watchlistNewEpisodes > 0) && (
                          <div className="pointer-events-none absolute right-2 top-2 z-20 rounded-full bg-primary/88 px-2 py-1 text-[10px] font-semibold text-white shadow-lg">
                            +{item.watchlistNewSeasons}S / +{item.watchlistNewEpisodes}E
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

        {/* Recommendations */}
        {watchlist.length > 0 && (
          <div className="mt-16">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold text-white">Recommended For You</h2>
              </div>

              {/* Filter buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant={typeFilter === "all" ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setTypeFilter("all")}
                  className="rounded-lg"
                >
                  All
                </Button>
                <Button
                  variant={typeFilter === "movie" ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setTypeFilter("movie")}
                  className="flex items-center gap-1.5 rounded-lg"
                >
                  <Film className="w-3.5 h-3.5" />
                  Movies
                </Button>
                <Button
                  variant={typeFilter === "tv" ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setTypeFilter("tv")}
                  className="flex items-center gap-1.5 rounded-lg"
                >
                  <Tv className="w-3.5 h-3.5" />
                  TV Shows
                </Button>
              </div>

              {/* Refresh button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={recsLoading}
                className="flex items-center gap-2 self-start text-white/60 hover:text-white sm:ml-auto"
              >
                <RefreshCw className={`w-4 h-4 ${recsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {recommendations.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {recommendations.map((item) => (
                  <MovieCard key={item._id} content={item} onPlay={handlePlay} layout="grid" />
                ))}
              </div>
            ) : (
              <p className="text-white/40 text-sm">
                {typeFilter === "all"
                  ? "No recommendations available."
                  : `No ${typeFilter === "movie" ? "movies" : "TV shows"} to recommend.`}
              </p>
            )}
          </div>
        )}
      </main>

      {contextMenu && (
        <>
          <Button
            type="button"
            variant="ghost"
            className="fixed inset-0 z-40 cursor-default bg-transparent hover:bg-transparent p-0 rounded-none"
            onClick={() => setContextMenu(null)}
            aria-label="Close bookmark menu"
          />
          <div
            className="fixed z-50 min-w-64 overflow-hidden rounded-2xl border border-white/10 bg-[color-mix(in_oklab,var(--color-popover)_94%,transparent)] shadow-[0_18px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="border-b border-white/8 px-4 py-3">
              <p className="truncate text-sm font-medium text-white">{contextMenu.title}</p>
              <p className="text-xs text-white/45">Add to bookmark folder</p>
            </div>
            <div className="p-2">
              <Button
                variant="ghost"
                className="w-full justify-start rounded-xl text-left text-white/72 hover:bg-white/6 hover:text-white"
                onClick={async () => {
                  await handleAssignFolder(contextMenu.contentId, "unsorted");
                  setContextMenu(null);
                }}
              >
                Unsorted
              </Button>
              {folderOptions.map((folder) => (
                <Button
                  key={folder}
                  variant="ghost"
                  className="w-full justify-start rounded-xl text-left text-white/72 hover:bg-white/6 hover:text-white"
                  onClick={async () => {
                    await handleAssignFolder(contextMenu.contentId, folder);
                    setContextMenu(null);
                  }}
                >
                  {folder}
                </Button>
              ))}
            </div>
          </div>
        </>
      )}

      <Dialog
        open={!!pendingDeleteFolder}
        onOpenChange={(open) => !open && setPendingDeleteFolder(null)}
      >
        <DialogContent className="border-white/10 bg-[hsl(220,20%,8%)] text-white">
          <DialogHeader>
            <DialogTitle>Delete folder?</DialogTitle>
            <DialogDescription className="text-white/58">
              {pendingDeleteFolder
                ? `Are you sure you want to delete "${pendingDeleteFolder}"? Everything inside it will move back to Unsorted.`
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
              Yes, delete it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
