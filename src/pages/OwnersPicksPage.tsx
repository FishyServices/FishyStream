import { useNavigate } from "@tanstack/react-router";
import { Loader2, Award, Film, Tv, Star } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useCuratedPicks } from "@/hooks/useContent";

export function OwnersPicksPage() {
  const navigate = useNavigate();
  const { movies, tv, anime, isLoading } = useCuratedPicks();

  const handlePlay = (
    tmdbId: string,
    season?: number,
    episode?: number,
    source?: string,
    dub?: boolean,
    type?: "movie" | "tv"
  ) => {
    navigate({
      to: "/watch/$id",
      params: { id: tmdbId },
      search: {
        type,
        season,
        episode,
        source,
        dub
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-32 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const sections = [
    { title: "Best Movies", items: movies, icon: Film, type: "movie" as const },
    { title: "Best TV Shows", items: tv, icon: Tv, type: "tv" as const },
    { title: "Best Anime", items: anime, icon: Star, type: "tv" as const }
  ];

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      <Header />

      <main className="page-stack px-4 sm:px-6 lg:px-12 pt-24">
        <div className="space-y-16">
          {sections.map((sect) => (
            <section key={sect.title} className="space-y-6">
              <div className="flex items-center gap-2 border-b border-white/6 pb-2">
                <sect.icon className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold text-white font-display">{sect.title}</h2>
              </div>

              {sect.items.length === 0 ? (
                <p className="text-white/40 text-sm">No curated items synced.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-1 gap-y-6 sm:grid-cols-3 sm:gap-1 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {sect.items.slice(0, 20).map((content, idx) => {
                    const rank = idx + 1;
                    const badgeColor =
                      rank === 1
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                        : rank === 2
                          ? "bg-slate-300/20 text-slate-200 border-slate-300/30"
                          : rank === 3
                            ? "bg-amber-700/20 text-amber-600 border-amber-700/30"
                            : "bg-white/5 text-white/70 border-white/10";

                    return (
                      <div
                        key={content._id}
                        className="relative group transition-all duration-300 hover:scale-[1.02]"
                      >
                        <div
                          className={`absolute top-3 left-3 z-20 px-3 py-1 text-sm font-black rounded-lg border backdrop-blur-md ${badgeColor}`}
                        >
                          #{rank}
                        </div>
                        <MovieCard
                          content={content}
                          onPlay={(id) =>
                            handlePlay(id, undefined, undefined, undefined, undefined, sect.type)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

export default OwnersPicksPage;
