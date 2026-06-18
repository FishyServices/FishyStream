import { createFileRoute } from "@tanstack/react-router";
import { SearchPage } from "@/pages/SearchPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

interface SearchSearch {
  q?: string;
  type?: string;
  sort?: string;
}

export const Route = createFileRoute("/search")({
  validateSearch: (search: Record<string, unknown>): SearchSearch => {
    return {
      q: typeof search.q === "string" ? search.q : undefined,
      type: typeof search.type === "string" ? search.type : undefined,
      sort: typeof search.sort === "string" ? search.sort : undefined
    };
  },
  component: () => (
    <AppRouteProviders>
      <SearchPage />
    </AppRouteProviders>
  )
});
