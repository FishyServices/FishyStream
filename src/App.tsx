import { useUser } from "@clerk/react";
import { useNavigate } from "react-router-dom";
import { Toaster } from "sonner";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { ContentRow } from "@/components/ContentRow";
import { useFeaturedContent, useAllCategories } from "@/hooks/useContent";
import type { Doc } from "../convex/_generated/dataModel";

function Footer() {
  return (
    <footer className="bg-background border-t border-white/10 py-12 px-4 sm:px-6 lg:px-12 mt-12">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Browse</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li><a href="#" className="hover:text-white">Movies</a></li>
              <li><a href="#" className="hover:text-white">TV Shows</a></li>
              <li><a href="#" className="hover:text-white">New Releases</a></li>
              <li><a href="#" className="hover:text-white">Popular</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Support</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li><a href="#" className="hover:text-white">Help Center</a></li>
              <li><a href="#" className="hover:text-white">Account</a></li>
              <li><a href="#" className="hover:text-white">Contact Us</a></li>
              <li><a href="#" className="hover:text-white">FAQ</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-white">Terms of Service</a></li>
              <li><a href="#" className="hover:text-white">Cookie Policy</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Connect</h3>
            <ul className="space-y-2 text-sm text-white/60">
              <li><a href="#" className="hover:text-white">Twitter</a></li>
              <li><a href="#" className="hover:text-white">Instagram</a></li>
              <li><a href="#" className="hover:text-white">Facebook</a></li>
            </ul>
          </div>
        </div>
        <div className="flex items-center justify-between pt-8 border-t border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <span className="text-primary-foreground font-bold">F</span>
            </div>
            <span className="font-bold">FishyStream</span>
          </div>
          <p className="text-sm text-white/40">© 2024 FishyStream. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export function App() {
  const { isLoaded } = useUser();
  const navigate = useNavigate();
  const categories = useAllCategories();
  const featuredContent = useFeaturedContent();

  const handlePlay = (content: Doc<"content">) => {
    navigate(`/watch/${content._id}`);
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster position="top-right" richColors />
      <Header />

      <main>
        {featuredContent && <Hero content={featuredContent} onPlay={handlePlay} />}

        <div className="relative -mt-24 z-10 space-y-2 pb-8">
          {categories.map((category) => (
            <ContentRow
              key={category.id}
              title={category.title}
              content={category.content}
              onPlay={handlePlay}
            />
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}

export default App;
