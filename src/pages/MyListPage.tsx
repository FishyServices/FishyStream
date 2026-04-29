import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles, RefreshCw, Film, Tv } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useMyWatchlist } from "@/hooks/useWatchlist";
import { useUser } from "@clerk/react";
import { useRecommendations } from "@/hooks/useContent";
import { Button } from "@fishy/ui";

export function MyListPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const watchlist = useMyWatchlist();
  const [typeFilter, setTypeFilter] = useState<"all" | "movie" | "tv">("all");
  const [refreshSeed, setRefreshSeed] = useState(0);
  const { recommendations, isLoading: recsLoading } = useRecommendations(
    watchlist,
    12,
    typeFilter,
    refreshSeed
  );

  const handlePlay = (tmdbId: string) => {
    navigate(`/watch/${tmdbId}`);
  };

  const handleRefresh = () => {
    setRefreshSeed((prev) => prev + 1);
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
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {watchlist.map((item) => (
              <MovieCard key={item._id} content={item} onPlay={handlePlay} layout="grid" />
            ))}
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
                <button
                  onClick={() => setTypeFilter("all")}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === "all"
                      ? "bg-primary text-white"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setTypeFilter("movie")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === "movie"
                      ? "bg-primary text-white"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  Movies
                </button>
                <button
                  onClick={() => setTypeFilter("tv")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    typeFilter === "tv"
                      ? "bg-primary text-white"
                      : "bg-white/10 text-white/70 hover:bg-white/20"
                  }`}
                >
                  <Tv className="w-3.5 h-3.5" />
                  TV Shows
                </button>
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
    </div>
  );
}
