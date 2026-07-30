import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, RefreshCw, Film, Tv, Folder, Check, SlidersHorizontal } from "lucide-react";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { useAllMyWatchlist } from "@/features/library/useWatchlist";
import { useUser } from "@clerk/react";
import { useRecommendations } from "@/features/catalog/queries/useContent";
import { useRecommendationFolderScope } from "@/features/catalog/recommendationFolderScope";
import { createPlayHandler, type PlayHandler } from "@/shared/navigation/watchNavigation";
import {
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@fishy/ui";

type RecommendationsSectionProps = {
  layout?: "page" | "section";
  limit?: number;
  onPlay?: PlayHandler;
  emptyAction?: ReactNode;
  showFolderFilter?: boolean;
};

export function RecommendationsSection({
  layout = "page",
  limit = layout === "page" ? 36 : 12,
  onPlay,
  emptyAction,
  showFolderFilter = true
}: RecommendationsSectionProps) {
  const navigate = useNavigate();
  const { isSignedIn, user } = useUser();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const watchlistData = useAllMyWatchlist();
  const hasHistoryOrWatchlist = watchlistData.length > 0 || !!isSignedIn;
  const { scope: folderScope, setScope: setFolderScope } = useRecommendationFolderScope(
    user?.id ?? "guest"
  );
  const folderOptions = useMemo(
    () =>
      Array.from(
        new Set(
          watchlistData
            .map((item) => item.watchlistFolder?.trim())
            .filter((folder): folder is string => !!folder)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [watchlistData]
  );
  const { recommendations, isLoading } = useRecommendations(
    limit,
    typeFilter,
    refreshSeed,
    hasHistoryOrWatchlist
  );
  const playHandler = onPlay ?? createPlayHandler(navigate);

  const toggleFolder = (folder: string) => {
    const folders = folderScope.folders.includes(folder)
      ? folderScope.folders.filter((item) => item !== folder)
      : [...folderScope.folders, folder].sort((a, b) => a.localeCompare(b));
    setFolderScope({ ...folderScope, folders });
  };

  const filterTabs = (
    <Tabs value={typeFilter} onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}>
      <TabsList className="h-auto rounded-xl border border-border/65 bg-muted/45 p-1">
        <TabsTrigger
          value="all"
          className="rounded-lg data-selected:bg-primary data-selected:text-primary-foreground"
        >
          All
        </TabsTrigger>
        <TabsTrigger
          value="movie"
          className="rounded-lg data-selected:bg-primary data-selected:text-primary-foreground"
        >
          <Film className="h-3.5 w-3.5" />
        </TabsTrigger>
        <TabsTrigger
          value="tv"
          className="rounded-lg data-selected:bg-primary data-selected:text-primary-foreground"
        >
          <Tv className="h-3.5 w-3.5" />
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const folderFilter = showFolderFilter && folderOptions.length > 0 && (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="min-h-11 rounded-xl border border-border/65 bg-card/60 px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Choose folders used for recommendations"
          />
        }
      >
        <Folder className="mr-2 h-4 w-4" />
        {folderScope.folders.length === 0
          ? "All folders"
          : `${folderScope.folders.length} folder${folderScope.folders.length === 1 ? "" : "s"}`}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72 rounded-xl border border-border/70 bg-popover p-1 shadow-xl">
        <DropdownMenuLabel className="px-2 py-2 text-sm font-medium text-foreground">
          Recommendation sources
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => setFolderScope({ ...folderScope, mode: "include" })}
        >
          {folderScope.mode === "include" ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="w-4" />
          )}
          Use selected folders only
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-2"
          onClick={() => setFolderScope({ ...folderScope, mode: "exclude" })}
        >
          {folderScope.mode === "exclude" ? (
            <Check className="h-4 w-4" />
          ) : (
            <span className="w-4" />
          )}
          Exclude selected folders
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1 bg-border/65" />
        {folderOptions.map((folder) => {
          const selected = folderScope.folders.includes(folder);
          return (
            <DropdownMenuItem
              key={folder}
              className="gap-2"
              onClick={(event) => {
                event.preventDefault();
                toggleFolder(folder);
              }}
            >
              {selected ? <Check className="h-4 w-4 text-primary" /> : <span className="w-4" />}
              <span className="truncate">{folder}</span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator className="my-1 bg-border/65" />
        <DropdownMenuItem
          disabled={folderScope.folders.length === 0}
          onClick={() => setFolderScope({ mode: "include", folders: [] })}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Clear folder filter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const refreshButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setRefreshSeed((previous) => previous + 1)}
      disabled={isLoading}
      className="rounded-xl border border-border/65 bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
      aria-label="Refresh recommendations"
    >
      <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
    </Button>
  );

  const grid = (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {recommendations.map((item) => (
        <MovieCard key={item._id} content={item} onPlay={playHandler} layout="grid" />
      ))}
    </div>
  );

  if (isLoading && recommendations.length === 0 && layout === "page") {
    return <GridSkeleton />;
  }

  if (layout === "section") {
    return (
      <section className="mt-16 border-t border-border/60 pt-10">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-bold text-foreground">Recommended</h2>
          </div>
          {filterTabs}
          {folderFilter}
          <div className="self-start sm:ml-auto">{refreshButton}</div>
        </div>
        {recommendations.length > 0 ? (
          grid
        ) : (
          <p className="text-sm text-muted-foreground">No recommendations yet</p>
        )}
      </section>
    );
  }

  return (
    <>
      <PageHeader
        title="For You"
        actions={
          <div className="flex items-center gap-2">
            {filterTabs}
            {folderFilter}
            {refreshButton}
          </div>
        }
      />
      {recommendations.length > 0 ? (
        <div className="rounded-2xl border border-border/55 bg-card/28 p-3 sm:p-5">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <p className="text-sm text-muted-foreground">
              {folderScope.folders.length > 0
                ? folderScope.mode === "include"
                  ? "Based only on titles in your selected folders"
                  : "Based on titles outside your excluded folders"
                : "Based on your saved titles and viewing activity"}
            </p>
          </div>
          {grid}
        </div>
      ) : (
        <EmptyState
          icon={<Sparkles className="h-10 w-10 text-muted-foreground" />}
          title="Add a few titles to your list to unlock picks made for you"
          action={emptyAction ?? <Button onClick={() => navigate("/movies")}>Browse movies</Button>}
        />
      )}
    </>
  );
}
