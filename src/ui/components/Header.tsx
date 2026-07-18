import { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Search,
  Menu,
  X,
  ChevronDown,
  Crown,
  Settings,
  Tv,
  Film,
  Clock,
  BookMarked,
  User as UserIcon
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@fishy/ui";

const navLinks = [
  { label: "Home", href: "/" },
  {
    label: "Movies",
    href: "/movies",
    icon: Film,
    dropdown: [
      { label: "All", href: "/movies" },
      { label: "Trending", href: "/movies?sort=trending" },
      { label: "New", href: "/movies?sort=new" },
      { label: "Top Rated", href: "/movies?sort=rating" }
    ]
  },
  {
    label: "TV Shows",
    href: "/tv-shows",
    icon: Tv,
    dropdown: [
      { label: "All", href: "/tv-shows" },
      { label: "Trending", href: "/tv-shows?sort=trending" },
      { label: "Now Airing", href: "/tv-shows?sort=new" },
      { label: "Top Rated", href: "/tv-shows?sort=rating" }
    ]
  },
  { label: "Picks", href: "/best", icon: Crown }
];

const profileLinks = [
  { label: "My List", href: "/my-list", icon: BookMarked },
  { label: "History", href: "/history", icon: Clock },
  { label: "Settings", href: "/settings", icon: Settings }
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
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setProfileOpen(false);
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

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-header transition-all duration-300 ${
        scrolled
          ? "border-b border-white/8 bg-background/95 shadow-[0_18px_60px_rgba(0,0,0,0.28)]"
          : "bg-linear-to-b from-background/88 via-background/36 to-transparent"
      }`}
    >
      <div className="px-4 sm:px-6 lg:px-10">
        <div className="flex min-h-18 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-8">
            <Link to="/" className="flex shrink-0 items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="font-display text-sm font-bold text-white">F</span>
              </div>
              <span className="hidden font-display text-lg font-bold tracking-tight text-white sm:block">
                FishyStream
              </span>
            </Link>

            <nav className="hidden items-center gap-1 rounded-lg border border-white/8 bg-white/[0.035] p-1 lg:flex">
              {navLinks.map((link) =>
                link.dropdown ? (
                  <DropdownMenu key={link.label}>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium ${
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
                    <DropdownMenuContent className="mt-2 w-44 rounded-lg border-white/10 bg-popover p-1 shadow-md">
                      {link.dropdown.map((item) => (
                        <DropdownMenuItem
                          key={item.label}
                          className="rounded-md px-3 py-2 text-sm text-foreground/74 focus:bg-accent focus:text-accent-foreground"
                          onClick={() => navigate(item.href)}
                        >
                          {item.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <Link
                    key={link.label}
                    to={link.href}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      location.pathname === link.href
                        ? "bg-white text-black"
                        : "text-white/68 hover:bg-white/7 hover:text-white"
                    }`}
                  >
                    {link.label}
                  </Link>
                )
              )}
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
                    placeholder="Search"
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
                className="h-11 w-11 rounded-md text-white/70 hover:bg-white/8 hover:text-white"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </Button>
            )}

            {isSignedIn ? (
              <Popover open={profileOpen} onOpenChange={setProfileOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="ghost"
                      className="flex h-11 w-11 items-center justify-center rounded-full p-0 hover:bg-white/5"
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
                    </Button>
                  }
                />
                <PopoverContent className="mt-2 w-52 overflow-hidden rounded-lg border-white/10 bg-popover p-1 shadow-md">
                  <div className="border-b border-white/8 px-4 py-3">
                    <p className="truncate text-sm font-medium text-foreground">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {user?.emailAddresses[0]?.emailAddress}
                    </p>
                  </div>
                  <div className="py-1">
                    {profileLinks.map((item) => (
                      <Button
                        key={item.label}
                        variant="ghost"
                        className="mx-1 flex w-[calc(100%-0.5rem)] items-center justify-start gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground/74 hover:bg-accent hover:text-accent-foreground"
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
                      className="mx-1 flex w-[calc(100%-0.5rem)] items-center justify-start gap-3 rounded-md px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-400"
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
              <div className="hidden items-center gap-1 sm:flex">
                <Link
                  to="/my-list"
                  className="flex h-11 w-11 items-center justify-center rounded-md text-white/70 transition-colors hover:bg-white/8 hover:text-white"
                  aria-label="My List"
                >
                  <BookMarked className="h-4 w-4" />
                </Link>
                <Button
                  size="sm"
                  className="rounded-md bg-primary px-4 text-white hover:bg-primary/90"
                  onClick={() => navigate("/sign-in")}
                >
                  Sign In
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11 rounded-md text-white/70 hover:bg-white/8 hover:text-white lg:hidden"
              onClick={(e) => {
                e.currentTarget.blur();
                setMobileOpen(true);
              }}
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
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border-white/14 bg-white/8 py-3 pl-11 pr-11 text-sm text-white placeholder:text-white/40 focus-visible:border-primary/60 focus-visible:bg-white/12"
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
          className="w-[min(22rem,calc(100vw-0.75rem))] border-l border-white/8 bg-background p-0 text-white sm:w-88"
        >
          <SheetHeader className="border-b border-white/8 px-5 py-4">
            <SheetTitle className="text-lg font-semibold text-white">Browse</SheetTitle>
          </SheetHeader>
          <div className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
            <nav className="flex flex-col gap-2">
              {navLinks.map((link) => (
                <div key={link.label} className="border-b border-white/6 last:border-b-0">
                  <Link
                    to={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors ${
                      location.pathname === link.href
                        ? "bg-white/10 text-white"
                        : "text-white/72 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {link.icon && <link.icon className="h-4 w-4" />}
                    {link.label}
                  </Link>
                  {link.dropdown && (
                    <div className="grid grid-cols-2 gap-1 px-3 pb-2">
                      {link.dropdown.map((item) => (
                        <Link
                          key={item.label}
                          to={item.href}
                          onClick={() => setMobileOpen(false)}
                          className="rounded-md px-3 py-2 text-xs font-medium text-white/68 transition-colors hover:bg-white/8 hover:text-white"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="mt-2 border-t border-white/6 pt-3">
                {isSignedIn ? (
                  <div className="space-y-1">
                    <div className="px-1 pb-2">
                      <p className="truncate text-sm font-medium text-white">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="truncate text-xs text-white/45">
                        {user?.emailAddresses[0]?.emailAddress}
                      </p>
                    </div>
                    {profileLinks.map((item) => (
                      <Link
                        key={item.label}
                        to={item.href}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                      >
                        <item.icon className="h-4 w-4" />
                        {item.label}
                      </Link>
                    ))}
                    <Button
                      variant="ghost"
                      className="flex w-full items-center justify-start gap-3 rounded-md px-3 py-3 text-left text-sm text-red-400 hover:bg-red-500/10 hover:text-red-400"
                      onClick={() => signOut()}
                    >
                      <UserIcon className="h-4 w-4" />
                      Sign Out
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Link
                      to="/my-list"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      <BookMarked className="h-4 w-4" />
                      My List
                    </Link>
                    <Link
                      to="/history"
                      onClick={() => setMobileOpen(false)}
                      className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-white/72 transition-colors hover:bg-white/8 hover:text-white"
                    >
                      <Clock className="h-4 w-4" />
                      Watch History
                    </Link>
                    <Button
                      className="mt-2 w-full bg-primary text-white hover:bg-primary/90"
                      onClick={() => navigate("/sign-in")}
                    >
                      Sign In
                    </Button>
                  </div>
                )}
              </div>
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
