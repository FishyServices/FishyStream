import { useNavigate } from "react-router-dom";
import { Film, Tv, Star } from "lucide-react";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Header } from "@/ui/components/Header";
import { MovieCard } from "@/ui/components/MovieCard";
import { EmptyState, GridSkeleton, PageHeader } from "@/ui/components/UXPrimitives";
import { useCuratedPicks } from "@/features/catalog/queries/useContent";
import { createPlayHandler } from "@/shared/navigation/watchNavigation";

export function OwnersPicksPage() {
  const navigate = useNavigate();
  const { movies, tv, anime, isLoading } = useCuratedPicks();

  useSeoMeta({
    title: "Best Picks",
    description:
      "Hand-picked movies and TV shows curated by the FishyStream team. Find the best content to watch right now.",
    path: "/best"
  });

  const handlePlay = createPlayHandler(navigate);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="page-shell-wide page-stack">
          <GridSkeleton />
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
    <div className="min-h-screen bg-background pb-20 text-foreground">
      <Header />

      <main className="page-shell-wide page-stack pt-24">
        <PageHeader title="Picks" />

        <div className="space-y-14 sm:space-y-16">
          {sections.map((sect) => (
            <section key={sect.title} className="space-y-5">
              <div className="flex items-center gap-2.5 border-b border-white/6 pb-3">
                <sect.icon className="h-5 w-5 text-primary" />
                <h2 className="font-display text-xl font-bold text-white">{sect.title}</h2>
              </div>

              {sect.items.length === 0 ? (
                <EmptyState title="No picks yet" />
              ) : (
                <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-9 md:grid-cols-4 lg:grid-cols-5 lg:gap-x-5 xl:grid-cols-6 2xl:grid-cols-7 2xl:gap-x-6">
                  {sect.items.slice(0, 20).map((content) => (
                    <MovieCard
                      key={content._id}
                      content={content}
                      layout="grid"
                      onPlay={(id) =>
                        handlePlay(id, undefined, undefined, undefined, undefined, sect.type)
                      }
                    />
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
