import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/Header";
import { MovieCard } from "@/components/MovieCard";
import { useMyWatchlist } from "@/hooks/useWatchlist";
import { useUser } from "@clerk/react";

export function MyListPage() {
  const navigate = useNavigate();
  const { isSignedIn } = useUser();
  const watchlist = useMyWatchlist();

  const handlePlay = (tmdbId: string) => {
    navigate(`/watch/${tmdbId}`);
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-2">My List</h1>
            <p className="text-white/60">Please sign in to view your watchlist.</p>
          </div>
        </div>
      </div>
    );
  }

  if (watchlist === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="pt-24 px-4 sm:px-6 lg:px-12">
        <h1 className="text-3xl font-bold text-white mb-8">My List</h1>
        
        {watchlist.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-white/60">Your watchlist is empty. Add movies and shows to watch later.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {watchlist.map((item) => (
              <MovieCard key={item._id} content={item} onPlay={handlePlay} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
