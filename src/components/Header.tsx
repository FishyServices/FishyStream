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
  Settings,
  Tv,
  Film,
  Clock,
  BookMarked
} from "lucide-react";
import { Button } from "@fishy/ui";

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
    setSearchOpen(false);
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
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-border/70 bg-background/92 shadow-lg backdrop-blur-xl"
          : "bg-gradient-to-b from-background/82 via-background/32 to-transparent"
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-10" ref={dropdownRef}>
        <div className="flex min-h-16 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-8">
            <Link to="/" className="group flex items-center gap-2.5 shrink-0">
              <div className="relative h-8 w-8">
                <div className="absolute inset-0 rotate-6 rounded-lg bg-primary opacity-60 transition-transform group-hover:rotate-12" />
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-primary">
                  <span className="font-display text-sm font-bold text-white">F</span>
                </div>
              </div>
              <span className="hidden font-display text-lg font-bold tracking-tight sm:block">
                FishyStream
              </span>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navLinks.map((link) => (
                <div key={link.label} className="relative">
                  {link.dropdown ? (
                    <button
                      className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                        location.pathname === link.href
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                      onClick={() =>
                        setOpenDropdown(openDropdown === link.label ? null : link.label)
                      }
                    >
                      {link.label}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${
                          openDropdown === link.label ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  ) : (
                    <Link
                      to={link.href}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                        location.pathname === link.href
                          ? "bg-white/10 text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {link.label}
                    </Link>
                  )}

                  {link.dropdown && openDropdown === link.label && (
                    <div className="absolute left-0 top-full mt-1 w-48 rounded-lg border border-border/80 bg-popover py-1 shadow-lg">
                      {link.dropdown.map((item) => (
                        <Link
                          key={item.label}
                          to={item.href}
                          className="flex items-center px-4 py-2 text-sm text-foreground/74 transition-colors hover:bg-accent hover:text-accent-foreground"
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

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {searchOpen ? (
              <form onSubmit={handleSearch} className="hidden items-center md:flex">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
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
                    className="w-56 rounded-full border border-white/20 bg-white/10 py-2 pl-10 pr-10 text-sm text-white placeholder:text-white/40 transition-all focus:border-primary/60 focus:bg-white/15 focus:outline-none sm:w-72"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/80"
                    aria-label="Close search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </form>
            ) : null}

            {!searchOpen && (
              <button
                className="rounded-full p-2 text-white/70 transition-all hover:bg-white/8 hover:text-white"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </button>
            )}

            <button
              className="relative hidden rounded-full p-2 text-white/70 transition-all hover:bg-white/8 hover:text-white sm:inline-flex"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>

            {isSignedIn ? (
              <div className="relative">
                <button
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-all hover:bg-white/8"
                  onClick={() => setProfileOpen(!profileOpen)}
                >
                  <img
                    src={
                      user?.imageUrl ||
                      `https://ui-avatars.com/api/?name=${user?.firstName ?? "U"}&background=e50914&color=fff`
                    }
                    alt="Profile"
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-white/10"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent((user?.firstName ?? "U").charAt(0))}&background=e50914&color=fff`;
                    }}
                  />
                  <ChevronDown
                    className={`hidden h-3.5 w-3.5 text-white/60 transition-transform sm:block ${
                      profileOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {profileOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-xl border border-border/80 bg-popover shadow-lg">
                    <div className="border-b border-border/70 px-4 py-3">
                      <p className="truncate text-sm font-medium text-foreground">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user?.emailAddresses[0]?.emailAddress}
                      </p>
                    </div>
                    <div className="py-1">
                      {[
                        { label: "My List", href: "/my-list", icon: BookMarked },
                        { label: "Watch History", href: "/history", icon: Clock },
                        { label: "Settings", href: "/settings", icon: Settings }
                      ].map((item) => (
                        <Link
                          key={item.label}
                          to={item.href}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm text-foreground/74 transition-colors hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setProfileOpen(false)}
                        >
                          <item.icon className="h-4 w-4" />
                          {item.label}
                        </Link>
                      ))}
                    </div>
                    <div className="border-t border-border/70 py-1">
                      <button
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
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
                className="hidden bg-primary text-white hover:bg-primary/90 sm:inline-flex"
                onClick={() => navigate("/sign-in")}
              >
                Sign In
              </Button>
            )}

            <button
              className="rounded-full p-2 text-white/70 transition-all hover:bg-white/8 hover:text-white lg:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-white/8 py-3 md:hidden">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search titles, genres..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border border-white/14 bg-white/8 py-3 pl-11 pr-11 text-sm text-white placeholder:text-white/40 focus:border-primary/60 focus:bg-white/12 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 transition-colors hover:text-white/80"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </button>
            </form>
          </div>
        )}
      </div>

      {mobileOpen && (
        <div className="border-t border-white/8 bg-[hsl(220,20%,4%)/98] backdrop-blur-xl animate-fade-in-up lg:hidden">
          <div className="px-4 py-4 sm:px-6">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <div key={link.label} className="rounded-2xl border border-white/6 bg-white/[0.02]">
                  <Link
                    to={link.href}
                    className={`flex items-center gap-3 px-4 py-3.5 text-sm font-medium transition-colors ${
                      location.pathname === link.href
                        ? "text-white"
                        : "text-white/72 hover:text-white"
                    }`}
                  >
                    {link.icon && <link.icon className="h-4 w-4" />}
                    <span>{link.label}</span>
                  </Link>
                  {link.dropdown && (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/6 px-4 py-2.5">
                      {link.dropdown.map((item) => (
                        <Link
                          key={item.label}
                          to={item.href}
                          className="rounded-xl bg-white/[0.04] px-3 py-2 text-xs text-white/65 transition-colors hover:bg-white/[0.08] hover:text-white"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-2 rounded-2xl border border-white/6 bg-white/[0.02] p-3">
                {isSignedIn ? (
                  <div className="space-y-2">
                    <div className="px-1 pb-2">
                      <p className="truncate text-sm font-medium text-white">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="truncate text-xs text-white/45">
                        {user?.emailAddresses[0]?.emailAddress}
                      </p>
                    </div>
                    <Link
                      to="/my-list"
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/6 hover:text-white"
                    >
                      <BookMarked className="h-4 w-4" />
                      My List
                    </Link>
                    <Link
                      to="/history"
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/6 hover:text-white"
                    >
                      <Clock className="h-4 w-4" />
                      Watch History
                    </Link>
                    <button
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-400 transition-colors hover:bg-red-500/10"
                      onClick={() => signOut()}
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <Button
                    className="w-full bg-primary text-white hover:bg-primary/90"
                    onClick={() => navigate("/sign-in")}
                  >
                    Sign In
                  </Button>
                )}
              </div>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
