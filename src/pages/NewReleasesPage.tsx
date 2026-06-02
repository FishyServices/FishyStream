import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useNewReleases } from "@/hooks/useContent";

export function NewReleasesPage() {
  const navigate = useNavigate();
  const newReleases = useNewReleases();

  const handlePlay = (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: "movie" | "tv"
  ) => {
    const params = new URLSearchParams();
    params.set("type", type ?? "movie");
    if (season !== undefined) params.set("season", String(season));
    if (episode !== undefined) params.set("episode", String(episode));
    if (source) params.set("source", source);
    if (dub) params.set("dub", "true");
    navigate(`/watch/${tmdbId}?${params}`);
  };

  if (newReleases === undefined) {
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
        <h1 className="text-3xl font-bold text-white mb-8">New Releases</h1>

        {newReleases.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60">
              No new releases available. Sync from TMDB to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {newReleases.map((content) => (
              <MovieCard key={content._id} content={content} onPlay={handlePlay} layout="grid" />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
