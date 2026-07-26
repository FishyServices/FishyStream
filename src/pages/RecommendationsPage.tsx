import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Sparkles, RefreshCw, Film, Tv } from "lucide-react";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { useMyWatchlist } from "@/features/library/useWatchlist";
import { useUser } from "@clerk/react";
import { useRecommendations } from "@/features/catalog/queries/useContent";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";
import { Button, Tabs, TabsList, TabsTrigger } from "@fishy/ui";

export function RecommendationsPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [refreshSeed, setRefreshSeed] = useState(0);

  useSeoMeta({
    title: "Recommendations",
    description:
      "Personalized movie and TV show recommendations picked just for you on FishyStream.",
    path: "/recommendations",
    noIndex: true
  });

  const watchlistData = useMyWatchlist();
  const hasHistoryOrWatchlist = !!(watchlistData && watchlistData.length > 0) || isSignedIn;

  const { recommendations, isLoading } = useRecommendations(
    36,
    typeFilter,
    refreshSeed,
    hasHistoryOrWatchlist
  );

  const handlePlay = createPlayHandler(navigate);

  const handleRefresh = () => setRefreshSeed((prev) => prev + 1);

  if (isLoading && recommendations.length === 0) {
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
          title="For You"
          actions={
            <div className="flex items-center gap-2">
              <Tabs
                value={typeFilter}
                onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
              >
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
                    <Film className="w-3.5 h-3.5" />
                  </TabsTrigger>
                  <TabsTrigger
                    value="tv"
                    className="rounded-lg data-selected:bg-primary data-selected:text-primary-foreground"
                  >
                    <Tv className="w-3.5 h-3.5" />
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoading}
                className="rounded-xl border border-border/65 bg-card/60 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Refresh recommendations"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          }
        />

        {recommendations.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-10 w-10 text-muted-foreground" />}
            title="Add a few titles to your list to unlock picks made for you"
            action={
              <Button className="rounded-xl" onClick={() => navigate("/movies")}>
                Browse movies
              </Button>
            }
          />
        ) : (
          <div className="rounded-2xl border border-border/55 bg-card/28 p-3 sm:p-5">
            <div className="mb-5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <p className="text-sm text-muted-foreground">
                Based on your saved titles and viewing activity
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {recommendations.map((item) => (
                <MovieCard key={item._id} content={item} onPlay={handlePlay} layout="grid" />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
