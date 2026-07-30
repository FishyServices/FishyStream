import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Header } from "@/ui/components/Header";
import { RecommendationsSection } from "@/ui/components/RecommendationsSection";

export function RecommendationsPage() {
  useSeoMeta({
    title: "Recommendations",
    description:
      "Personalized movie and TV show recommendations picked just for you on FishyStream.",
    path: "/recommendations",
    noIndex: true
  });

  return (
    <div className="app-canvas min-h-screen">
      <Header />
      <main className="page-shell-wide page-stack">
        <RecommendationsSection />
      </main>
    </div>
  );
}
