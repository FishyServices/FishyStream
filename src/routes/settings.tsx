import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/pages/SettingsPage";
import { AppRouteProviders } from "@/components/AppRouteProviders";

export const Route = createFileRoute("/settings")({
  component: () => (
    <AppRouteProviders>
      <SettingsPage />
    </AppRouteProviders>
  )
});
