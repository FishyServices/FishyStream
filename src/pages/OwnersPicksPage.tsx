import { useNavigate } from "react-router-dom";
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
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (season !== undefined) params.set("season", String(season));
    if (episode !== undefined) params.set("episode", String(episode));
    if (source) params.set("source", source);
    if (dub) params.set("dub", "true");
    const qs = params.toString();
    navigate(`/watch/${tmdbId}${qs ? `?${qs}` : ""}`);
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
        <div className="mb-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/6 text-primary">
            <Award className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-bold text-white font-display">Owner Picks</h1>
        </div>

        <div className="space-y-14 sm:space-y-16">
          {sections.map((sect) => (
            <section key={sect.title} className="space-y-5">
              <div className="flex items-center justify-between gap-4 border-b border-white/6 pb-3">
                <div className="flex items-center gap-2.5">
                  <sect.icon className="h-5 w-5 text-primary" />
                  <h2 className="text-xl font-bold text-white font-display">{sect.title}</h2>
                </div>
                <span className="text-xs font-semibold text-white/38">
                  Top {Math.min(20, sect.items.length)}
                </span>
              </div>

              {sect.items.length === 0 ? (
                <p className="text-white/40 text-sm">No curated items synced.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-9 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 xl:grid-cols-6 2xl:grid-cols-7 2xl:gap-x-6">
                  {sect.items.slice(0, 20).map((content) => (
                    <div
                      key={content._id}
                      className="relative group/card transition-transform duration-300 hover:-translate-y-1"
                    >
                      <MovieCard
                        content={content}
                        layout="grid"
                        onPlay={(id) =>
                          handlePlay(id, undefined, undefined, undefined, undefined, sect.type)
                        }
                      />
                    </div>
                  ))}
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
