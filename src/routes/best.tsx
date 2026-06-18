import { createFileRoute } from "@tanstack/react-router";
import { OwnersPicksPage } from "@/pages/OwnersPicksPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

export const Route = createFileRoute("/best")({
  component: () => (
    <AppRouteProviders>
      <OwnersPicksPage />
    </AppRouteProviders>
  )
});
