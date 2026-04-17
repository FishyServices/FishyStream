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
import { PopularPage } from "./pages/PopularPage";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const elem = document.getElementById("root")!;

createRoot(elem).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY!}
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#2563eb",
          colorText: "white"
        }
      }}
    >
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <BrowserRouter>
          <Routes>
            <Route path="/sign-in/*" element={<SignInPage />} />
            <Route path="/sign-up/*" element={<SignUpPage />} />
            <Route path="/watch/:id" element={<WatchPage />} />
            <Route path="/movies" element={<MoviesPage />} />
            <Route path="/tv-shows" element={<TVShowsPage />} />
            <Route path="/new-releases" element={<NewReleasesPage />} />
            <Route path="/popular" element={<PopularPage />} />
            <Route path="/" element={<App />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  </StrictMode>
);
