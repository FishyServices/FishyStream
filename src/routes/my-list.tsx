import { createFileRoute } from "@tanstack/react-router";
import { MyListPage } from "@/pages/MyListPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

export const Route = createFileRoute("/my-list")({
  component: () => (
    <AppRouteProviders withProgress={false}>
      <MyListPage />
    </AppRouteProviders>
  )
});
