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
  BookMarked,
  User as UserIcon
} from "lucide-react";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@fishy/ui";
import { useAcknowledgeWatchlistUpdates, useWatchlistUpdatesOnDemand } from "@/hooks/useWatchlist";

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
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [watchlistUpdates, setWatchlistUpdates] = useState<Awaited<
    ReturnType<ReturnType<typeof useWatchlistUpdatesOnDemand>>
  > | null>(null);
  const [loadingWatchlistUpdates, setLoadingWatchlistUpdates] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const acknowledgeUpdates = useAcknowledgeWatchlistUpdates();
  const fetchWatchlistUpdates = useWatchlistUpdatesOnDemand();
  const unseenUpdateCount = watchlistUpdates?.length ?? 0;

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setProfileOpen(false);
    setNotificationsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
    setSearchQuery("");
  };

  useEffect(() => {
    if (!notificationsOpen || !user || !watchlistUpdates || watchlistUpdates.length === 0) return;
    void acknowledgeUpdates({
      clerkUserId: user.id,
      contentIds: watchlistUpdates.map((item) => item.contentId)
    }).catch(() => {});
  }, [acknowledgeUpdates, notificationsOpen, user, watchlistUpdates]);

  useEffect(() => {
    if (!notificationsOpen) return;

    let cancelled = false;
    setLoadingWatchlistUpdates(true);

    void fetchWatchlistUpdates()
      .then((updates) => {
        if (!cancelled) {
          setWatchlistUpdates(updates);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWatchlistUpdates([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingWatchlistUpdates(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchWatchlistUpdates, notificationsOpen]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-white/8 bg-background/95 shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
          : "bg-linear-to-b from-background/88 via-background/36 to-transparent"
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-10">
        <div className="flex min-h-18 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-8">
            <Link to="/" className="group flex shrink-0 items-center gap-2.5">
              <div className="relative h-9 w-9">
                <div className="absolute inset-0 rotate-6 rounded-xl bg-primary opacity-60 transition-transform group-hover:rotate-12" />
                <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-primary shadow-[0_12px_30px_color-mix(in_oklab,var(--color-primary)_36%,transparent)]">
                  <span className="font-display text-sm font-bold text-white">F</span>
                </div>
              </div>
              <div className="hidden sm:block">
                <span className="block font-display text-lg font-bold tracking-tight text-white">
                  FishyStream
                </span>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 rounded-full border border-white/8 bg-white/4 p-1 lg:flex">
              {navLinks.map((link) => (
                <div key={link.label} className="relative">
                  {link.dropdown ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-medium ${
                              location.pathname === link.href
                                ? "bg-white text-black hover:bg-white/90 hover:text-black"
                                : "text-white/68 hover:bg-white/7 hover:text-white"
                            }`}
                          >
                            {link.label}
                            <ChevronDown className="h-3.5 w-3.5" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent className="mt-2 w-52 rounded-2xl border-white/10 bg-popover p-2 shadow-xl">
                        {link.dropdown.map((item) => (
                          <DropdownMenuItem
                            key={item.label}
                            className="rounded-xl px-4 py-2.5 text-sm text-foreground/74 focus:bg-accent focus:text-accent-foreground"
                            onClick={() => navigate(item.href)}
                          >
                            {item.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <Link
                      to={link.href}
                      className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
                        location.pathname === link.href
                          ? "bg-white text-black"
                          : "text-white/68 hover:bg-white/7 hover:text-white"
                      }`}
                    >
                      {link.label}
                    </Link>
                  )}
                </div>
              ))}
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {searchOpen ? (
              <form onSubmit={handleSearch} className="hidden items-center md:flex">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <Input
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
                    className="w-56 rounded-full border-white/14 bg-white/8 py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-white/36 focus-visible:border-primary/60 focus-visible:bg-white/12 sm:w-72"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-7 w-7 text-white/40 hover:text-white/80 hover:bg-transparent"
                    aria-label="Close search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </form>
            ) : null}

            {!searchOpen && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full text-white/70 hover:bg-white/8 hover:text-white"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </Button>
            )}

            <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative hidden rounded-full text-white/70 hover:bg-white/8 hover:text-white sm:inline-flex"
                    aria-label="Notifications"
                  >
                    <Bell className="h-5 w-5" />
                    {unseenUpdateCount > 0 && (
                      <>
                        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
                        <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-bold text-white">
                          {unseenUpdateCount > 9 ? "9+" : unseenUpdateCount}
                        </span>
                      </>
                    )}
                  </Button>
                }
              />
              <PopoverContent className="mt-2 w-84 overflow-hidden rounded-[1.35rem] border-white/10 bg-popover p-0 shadow-xl">
                <div className="border-b border-white/8 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-white">Watchlist updates</p>
                      <p className="text-xs text-white/48">
                        New seasons and episodes from titles in My List.
                      </p>
                    </div>
                    {unseenUpdateCount > 0 && (
                      <Badge className="border-primary/25 bg-primary/15 text-primary">
                        {unseenUpdateCount} new
                      </Badge>
                    )}
                  </div>
                </div>

                <ScrollArea className="max-h-96 p-2">
                  {loadingWatchlistUpdates ? (
                    <div className="px-3 py-6 text-center text-sm text-white/45">Loading…</div>
                  ) : (watchlistUpdates?.length ?? 0) === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-white/45">
                      No new season or episode updates right now.
                    </div>
                  ) : (
                    (watchlistUpdates ?? []).map((item) => (
                      <Button
                        key={item.contentId}
                        variant="ghost"
                        className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left h-auto justify-start hover:bg-white/6"
                        onClick={() => {
                          setNotificationsOpen(false);
                          if (item.tmdbId) {
                            navigate(`/watch/${item.tmdbId}`);
                          } else {
                            navigate("/my-list");
                          }
                        }}
                      >
                        <img
                          src={item.posterUrl}
                          alt={item.title}
                          className="h-16 w-11 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-white">{item.title}</p>
                          <p className="mt-1 text-xs text-white/54">
                            {item.newSeasons > 0
                              ? `+${item.newSeasons} season${item.newSeasons > 1 ? "s" : ""}`
                              : "No new seasons"}
                            {" · "}
                            {item.newEpisodes > 0
                              ? `+${item.newEpisodes} episode${item.newEpisodes > 1 ? "s" : ""}`
                              : "No new episodes"}
                          </p>
                          <p className="mt-1 text-[11px] text-primary/90">
                            Now at {item.currentSeasonCount} season
                            {item.currentSeasonCount === 1 ? "" : "s"} / {item.currentEpisodeCount}{" "}
                            episodes
                          </p>
                          {item.folder && (
                            <p className="mt-1 text-[11px] text-white/38">Folder: {item.folder}</p>
                          )}
                        </div>
                      </Button>
                    ))
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>

            {isSignedIn ? (
              <Popover open={profileOpen} onOpenChange={setProfileOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="flex items-center gap-2 rounded-full border border-white/8 bg-white/3 py-1 pl-1 pr-2 hover:bg-white/8 h-auto"
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
                      <ChevronDown className="hidden h-3.5 w-3.5 text-white/60 sm:block" />
                    </Button>
                  }
                />
                <PopoverContent className="mt-2 w-56 overflow-hidden rounded-[1.35rem] border-white/10 bg-popover p-1 shadow-xl">
                  <div className="border-b border-white/8 px-4 py-3">
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
                      <Button
                        key={item.label}
                        variant="ghost"
                        className="mx-1 flex w-[calc(100%-0.5rem)] items-center justify-start gap-3 rounded-xl px-4 py-2.5 text-left text-sm text-foreground/74 hover:bg-accent hover:text-accent-foreground"
                        onClick={() => {
                          setProfileOpen(false);
                          navigate(item.href);
                        }}
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Button>
                    ))}
                  </div>
                  <div className="border-t border-white/8 py-1">
                    <Button
                      variant="ghost"
                      className="mx-1 flex w-[calc(100%-0.5rem)] items-center justify-start gap-3 rounded-xl px-4 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => {
                        setProfileOpen(false);
                        signOut();
                      }}
                    >
                      <UserIcon className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <Button
                size="sm"
                className="hidden rounded-full bg-primary px-4 text-white hover:bg-primary/90 sm:inline-flex"
                onClick={() => navigate("/sign-in")}
              >
                Sign In
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-white/70 hover:bg-white/8 hover:text-white lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {searchOpen && (
          <div className="border-t border-white/8 py-3 md:hidden">
            <form onSubmit={handleSearch} className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <Input
                ref={searchRef}
                type="text"
                placeholder="Search titles, genres..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-2xl border-white/14 bg-white/8 py-3 pl-11 pr-11 text-sm text-white placeholder:text-white/40 focus-visible:border-primary/60 focus-visible:bg-white/12"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setSearchOpen(false);
                  setSearchQuery("");
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 h-7 w-7 text-white/40 hover:text-white/80 hover:bg-transparent"
                aria-label="Close search"
              >
                <X className="h-4 w-4" />
              </Button>
            </form>
          </div>
        )}
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="right"
          className="w-88 border-l border-white/8 bg-[hsl(220,20%,4%)/98] p-0 text-white"
        >
          <SheetHeader className="border-b border-white/8 px-5 py-4">
            <SheetTitle className="font-display text-xl text-white">Browse</SheetTitle>
          </SheetHeader>
          <div className="px-4 py-4">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <div key={link.label} className="rounded-2xl border border-white/6 bg-white/2">
                  <Link
                    to={link.href}
                    onClick={() => setMobileOpen(false)}
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
                          onClick={() => setMobileOpen(false)}
                          className="rounded-xl bg-white/4 px-3 py-2 text-xs text-white/65 transition-colors hover:bg-white/8 hover:text-white"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-2 rounded-2xl border border-white/6 bg-white/2 p-3">
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
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/6 hover:text-white"
                    >
                      <BookMarked className="h-4 w-4" />
                      My List
                    </Link>
                    <Link
                      to="/history"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/6 hover:text-white"
                    >
                      <Clock className="h-4 w-4" />
                      Watch History
                    </Link>
                    <Button
                      variant="ghost"
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-400 justify-start"
                      onClick={() => signOut()}
                    >
                      Sign Out
                    </Button>
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
        </SheetContent>
      </Sheet>
    </header>
  );
}
