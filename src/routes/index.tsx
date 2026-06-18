import { createFileRoute } from "@tanstack/react-router";
import { App } from "@/App";
import { AppRouteProviders } from "@/components/AppRouteProviders";

export const Route = createFileRoute("/")({
  component: () => (
    <AppRouteProviders>
      <App />
    </AppRouteProviders>
  )
});
