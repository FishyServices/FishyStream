import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, useAuth } from "@clerk/react";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { App } from "./App";
import { SignInPage } from "./pages/SignInPage";
import { SignUpPage } from "./pages/SignUpPage";
import { WatchPage } from "./pages/WatchPage";
import { MoviesPage } from "./pages/MoviesPage";
import { TVShowsPage } from "./pages/TVShowsPage";
import { NewReleasesPage } from "./pages/NewReleasesPage";
import { MyListPage } from "./pages/MyListPage";
import { WatchHistoryPage } from "./pages/WatchHistoryPage";
import { SearchPage } from "./pages/SearchPage";
import { GlobalWatchlistProvider } from "./hooks/useWatchlist";
import { WatchProgressProvider } from "./hooks/useWatchProgress";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in environment");
}

const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in environment");
}

const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
      appearance={{
        baseTheme: dark,
        variables: { colorPrimary: "hsl(2 71% 56%)", colorText: "white" }
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <GlobalWatchlistProvider>
          <WatchProgressProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/sign-in/*" element={<SignInPage />} />
                <Route path="/sign-up/*" element={<SignUpPage />} />
                <Route path="/watch/:id" element={<WatchPage />} />
                <Route path="/movies" element={<MoviesPage />} />
                <Route path="/tv-shows" element={<TVShowsPage />} />
                <Route path="/new-releases" element={<NewReleasesPage />} />
                <Route path="/my-list" element={<MyListPage />} />
                <Route path="/history" element={<WatchHistoryPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/" element={<App />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </BrowserRouter>
          </WatchProgressProvider>
        </GlobalWatchlistProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>
);
