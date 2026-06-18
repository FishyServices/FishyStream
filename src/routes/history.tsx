import { createFileRoute } from "@tanstack/react-router";
import { WatchHistoryPage } from "@/pages/WatchHistoryPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

export const Route = createFileRoute("/history")({
  component: () => (
    <AppRouteProviders>
      <WatchHistoryPage />
    </AppRouteProviders>
  )
});
