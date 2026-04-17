import { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  Bell,
  Menu,
  X,
  ChevronDown,
  Flame,
  Tv,
  Film,
  Star,
  Clock,
  BookMarked
} from "lucide-react";
import { Button } from "@/components/ui/button";

const GENRES = [
  "Action",
  "Comedy",
  "Drama",
  "Horror",
  "Sci-Fi",
  "Thriller",
  "Animation",
  "Documentary",
  "Romance",
  "Fantasy"
];

const navLinks = [
  { label: "Home", href: "/" },
  {
    label: "Movies",
    href: "/movies",
    icon: Film,
    dropdown: [
      { label: "All Movies", href: "/movies" },
      { label: "Trending", href: "/movies?sort=trending" },
      { label: "New Releases", href: "/movies?sort=new" },
      { label: "Top Rated", href: "/movies?sort=rating" }
    ]
  },
  {
    label: "TV Shows",
    href: "/tv-shows",
    icon: Tv,
    dropdown: [
      { label: "All Shows", href: "/tv-shows" },
      { label: "Trending", href: "/tv-shows?sort=trending" },
      { label: "Now Airing", href: "/tv-shows?sort=new" },
      { label: "Top Rated", href: "/tv-shows?sort=rating" }
    ]
  },
  { label: "New & Hot", href: "/new-releases", icon: Flame }
];

export function Header() {
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpenDropdown(null);
  }, [location.pathname]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (q) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
      setSearchOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[hsl(220,20%,4%)/95] backdrop-blur-xl border-b border-white/5 shadow-2xl"
          : "bg-gradient-to-b from-black/70 via-black/30 to-transparent"
      }`}
    >
      <div
        className="flex items-center justify-between px-4 sm:px-6 lg:px-10 h-16"
        ref={dropdownRef}
      >
        {/* Logo */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group">
            <div className="relative w-8 h-8">
              <div className="absolute inset-0 bg-primary rounded-lg rotate-6 opacity-60 group-hover:rotate-12 transition-transform" />
              <div className="absolute inset-0 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold font-display text-sm">F</span>
              </div>
            </div>
            <span className="font-display font-bold text-lg tracking-tight hidden sm:block">
              FishyStream
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <div key={link.label} className="relative">
                {link.dropdown ? (
                  <button
                    className={`flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      location.pathname === link.href ||
                      location.pathname.startsWith(link.href + "?")
                        ? "text-white bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                    onClick={() => setOpenDropdown(openDropdown === link.label ? null : link.label)}
                  >
                    {link.label}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform ${openDropdown === link.label ? "rotate-180" : ""}`}
                    />
                  </button>
                ) : (
                  <Link
                    to={link.href}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                      location.pathname === link.href
                        ? "text-white bg-white/10"
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    {link.label}
                  </Link>
                )}

                {/* Dropdown menu */}
                {link.dropdown && openDropdown === link.label && (
                  <div className="absolute top-full left-0 mt-1 w-48 py-1 bg-[hsl(220,16%,8%)] border border-white/10 rounded-lg shadow-2xl">
                    {link.dropdown.map((item) => (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center px-4 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                        onClick={() => setOpenDropdown(null)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Search */}
          {searchOpen ? (
            <form onSubmit={handleSearch} className="flex items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search titles, genres..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }
                  }}
                  className="w-52 sm:w-72 bg-white/10 border border-white/20 rounded-full py-2 pl-10 pr-10 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-primary/60 focus:bg-white/15 transition-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          ) : (
            <button
              className="p-2 text-white/70 hover:text-white hover:bg-white/8 rounded-full transition-all"
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
          )}

          {/* Notifications */}
          <button
            className="relative p-2 text-white/70 hover:text-white hover:bg-white/8 rounded-full transition-all"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-primary rounded-full" />
          </button>

          {/* Profile / Auth */}
          {isSignedIn ? (
            <div className="relative">
              <button
                className="flex items-center gap-2 pl-1 pr-2 py-1 hover:bg-white/8 rounded-full transition-all"
                onClick={() => setProfileOpen(!profileOpen)}
              >
                <img
                  src={
                    user?.imageUrl ||
                    `https://ui-avatars.com/api/?name=${user?.firstName ?? "U"}&background=e50914&color=fff`
                  }
                  alt="Profile"
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-white/10"
                  onError={(e) => {
                    const t = e.target as HTMLImageElement;
                    t.src = `https://ui-avatars.com/api/?name=${encodeURIComponent((user?.firstName ?? "U").charAt(0))}&background=e50914&color=fff`;
                  }}
                />
                <ChevronDown
                  className={`w-3.5 h-3.5 text-white/60 transition-transform hidden sm:block ${profileOpen ? "rotate-180" : ""}`}
                />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-[hsl(220,16%,8%)] border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/8">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-xs text-white/50 truncate">
                      {user?.emailAddresses[0]?.emailAddress}
                    </p>
                  </div>
                  <div className="py-1">
                    {[
                      { label: "My List", href: "/my-list", icon: BookMarked },
                      { label: "Watch History", href: "/history", icon: Clock }
                    ].map((item) => (
                      <Link
                        key={item.label}
                        to={item.href}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                        onClick={() => setProfileOpen(false)}
                      >
                        <item.icon className="w-4 h-4" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-white/8 py-1">
                    <button
                      className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                      onClick={() => {
                        signOut();
                        setProfileOpen(false);
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              className="hidden sm:inline-flex bg-primary hover:bg-primary/90 text-white"
              onClick={() => navigate("/sign-in")}
            >
              Sign In
            </Button>
          )}

          {/* Mobile menu button */}
          <button
            className="lg:hidden p-2 text-white/70 hover:text-white hover:bg-white/8 rounded-full transition-all"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="lg:hidden bg-[hsl(220,20%,4%)/98] backdrop-blur-xl border-t border-white/8 animate-fade-in-up">
          <nav className="flex flex-col p-4 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className={`flex items-center gap-3 py-3 px-4 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === link.href
                    ? "bg-white/10 text-white"
                    : "text-white/70 hover:text-white hover:bg-white/5"
                }`}
              >
                {link.icon && <link.icon className="w-4 h-4" />}
                {link.label}
              </Link>
            ))}
            {[
              { label: "My List", href: "/my-list" },
              { label: "History", href: "/history" }
            ].map((link) => (
              <Link
                key={link.label}
                to={link.href}
                className="py-3 px-4 rounded-lg text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            {!isSignedIn && (
              <Link
                to="/sign-in"
                className="mt-2 py-3 px-4 rounded-lg bg-primary text-white text-sm font-semibold text-center"
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
