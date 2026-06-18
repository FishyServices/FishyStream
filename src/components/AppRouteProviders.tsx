import { type ReactNode } from "react";
import { GlobalWatchlistProvider } from "@/hooks/useWatchlist";
import { WatchProgressProvider } from "@/hooks/useWatchProgress";

export function AppRouteProviders({
  children,
  withProgress = true
}: {
  children: ReactNode;
  withProgress?: boolean;
}) {
  return (
    <GlobalWatchlistProvider>
      {withProgress ? <WatchProgressProvider>{children}</WatchProgressProvider> : children}
    </GlobalWatchlistProvider>
  );
}
