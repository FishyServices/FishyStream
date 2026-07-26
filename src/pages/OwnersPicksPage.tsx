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
      <div className="app-canvas min-h-screen">
        <Header />
        <div className="page-shell-wide page-stack">
          <GridSkeleton variant="picks" />
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
    <div className="app-canvas min-h-screen pb-20 text-foreground">
      <Header />

      <main className="page-shell-wide page-stack">
        <PageHeader title="Picks" />

        <div className="space-y-10 sm:space-y-12">
          {sections.map((sect) => (
            <section
              key={sect.title}
              className="rounded-2xl border border-border/55 bg-card/28 p-4 sm:p-5"
            >
              <div className="mb-5 flex items-center gap-3 border-b border-border/55 pb-4">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12">
                  <sect.icon className="h-4 w-4 text-primary" />
                </span>
                <div>
                  <h2 className="font-display text-2xl font-bold text-foreground">{sect.title}</h2>
                </div>
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
