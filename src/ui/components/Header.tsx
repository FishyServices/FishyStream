import { useEffect, useRef, useState } from "react";
import { useClerk, useUser } from "@clerk/react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  BookMarked,
  Compass,
  Film,
  History,
  Home,
  LogOut,
  Menu,
  Search,
  Settings,
  Sparkles,
  Tv,
  UserRound
} from "lucide-react";
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  Dialog,
  DialogContent,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@fishy/ui";

type NavItem = { label: string; href: string; icon: typeof Home };

const primaryNav: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Movies", href: "/movies", icon: Film },
  { label: "TV Shows", href: "/tv-shows", icon: Tv },
  { label: "Picks", href: "/best", icon: Sparkles }
];

const libraryNav: NavItem[] = [
  { label: "My List", href: "/my-list", icon: BookMarked },
  { label: "History", href: "/history", icon: History }
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-sm font-black text-primary-foreground shadow-sm ">
        F
      </span>
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight text-foreground">
          FishyStream
        </span>
      )}
    </Link>
  );
}

function NavLink({
  item,
  collapsed,
  onNavigate
}: {
  item: NavItem;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const active =
    item.href === "/" ? location.pathname === "/" : location.pathname.startsWith(item.href);
  const Icon = item.icon;
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={`group relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      } ${collapsed ? "justify-center px-0 xl:justify-start xl:px-3" : ""}`}
    >
      <Icon className="h-4.5 w-4.5 shrink-0" />
      <span className={collapsed ? "hidden xl:block" : "block"}>{item.label}</span>
    </Link>
  );
}

function SearchDialog({
  open,
  onOpenChange
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);
  const go = (href: string) => {
    onOpenChange(false);
    navigate(href);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="media-surface w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-xl p-0">
        <Command className="bg-transparent">
          <CommandInput
            ref={inputRef}
            placeholder="Search titles or jump to a page…"
            className="h-14 text-base"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                const value = event.currentTarget.value.trim();
                if (value) go(`/search?q=${encodeURIComponent(value)}`);
              }
            }}
          />
          <CommandList className="max-h-[min(26rem,60dvh)] p-2">
            <CommandEmpty className="py-8 text-muted-foreground">
              Press Enter to search the catalog.
            </CommandEmpty>
            <CommandGroup heading="Go to">
              {[
                ...primaryNav,
                ...libraryNav,
                { label: "Settings", href: "/settings", icon: Settings }
              ].map((item) => (
                <CommandItem
                  key={item.href}
                  value={item.label}
                  onSelect={() => go(item.href)}
                  className="gap-3 rounded-lg px-3 py-2.5"
                >
                  <item.icon className="h-4 w-4 text-primary" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading="Search">
              <CommandItem
                value="Search movies and television"
                onSelect={() => go("/search")}
                className="gap-3 rounded-lg px-3 py-2.5"
              >
                <Search className="h-4 w-4 text-primary" />
                Open catalog search
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function Header() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches("input, textarea, select, [contenteditable='true']");
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === "/" && !editing) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <aside className="app-rail flex-col px-3 py-5">
        <div className="mb-8 px-2 xl:px-1">
          <Brand compact />
        </div>
        <nav className="space-y-1" aria-label="Primary navigation">
          {primaryNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed />
          ))}
        </nav>
        <div className="my-5 border-t border-border/60" />
        <nav className="space-y-1" aria-label="Library navigation">
          {libraryNav.map((item) => (
            <NavLink key={item.href} item={item} collapsed />
          ))}
        </nav>
        <div className="mt-auto space-y-2">
          <Button
            variant="secondary"
            onClick={() => setSearchOpen(true)}
            className="h-11 w-full justify-center rounded-lg px-0 xl:justify-start xl:px-3"
          >
            <Search className="h-4.5 w-4.5 shrink-0" />
            <span className="hidden xl:inline">Search</span>
            <kbd className="ml-auto hidden rounded border border-border/80 px-1.5 py-0.5 text-[11px] text-muted-foreground xl:inline">
              ⌘K
            </kbd>
          </Button>
          {isSignedIn ? (
            <>
              <Button
                variant="ghost"
                onClick={() => navigate("/settings")}
                className="h-11 w-full justify-center rounded-lg px-0 text-muted-foreground xl:justify-start xl:px-3"
              >
                <UserRound className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden max-w-36 truncate xl:inline">
                  {user?.firstName ?? "Account"}
                </span>
              </Button>
              <Button
                variant="ghost"
                onClick={() => signOut()}
                className="h-11 w-full justify-center rounded-lg px-0 text-destructive hover:bg-destructive/10 hover:text-destructive xl:justify-start xl:px-3"
              >
                <LogOut className="h-4.5 w-4.5 shrink-0" />
                <span className="hidden xl:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <Button
              onClick={() => navigate("/sign-in")}
              className="h-11 w-full justify-center rounded-lg px-0 xl:px-3"
            >
              {" "}
              <span className="hidden xl:inline">Sign in</span>
              <UserRound className="h-4.5 w-4.5 xl:hidden" />
            </Button>
          )}
        </div>
      </aside>

      <header className="app-topbar">
        <Brand />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>
      <nav className="app-bottom-nav" aria-label="Mobile navigation">
        <div className="mx-auto flex max-w-md items-center justify-between">
          {primaryNav.slice(0, 2).map((item) => (
            <NavLink key={item.href} item={item} collapsed />
          ))}
          <Button
            size="icon"
            className="h-11 w-11 rounded-full shadow-sm "
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Button>
          <NavLink item={libraryNav[0]!} collapsed />
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </nav>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="right"
          className="w-[min(22rem,calc(100vw-1rem))] border-border/70 bg-background p-4"
        >
          <SheetHeader className="mb-5">
            <SheetTitle>
              <Brand />
            </SheetTitle>
          </SheetHeader>
          <div className="space-y-1">
            {primaryNav.slice(2).map((item) => (
              <NavLink key={item.href} item={item} onNavigate={() => setMenuOpen(false)} />
            ))}
            <div className="my-4 border-t border-border/60" />
            {libraryNav.slice(1).map((item) => (
              <NavLink key={item.href} item={item} onNavigate={() => setMenuOpen(false)} />
            ))}
            <NavLink
              item={{ label: "Settings", href: "/settings", icon: Settings }}
              onNavigate={() => setMenuOpen(false)}
            />
            {isSignedIn ? (
              <Button
                variant="ghost"
                className="mt-3 w-full justify-start gap-3 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => signOut()}
              >
                <UserRound className="h-4.5 w-4.5" />
                Sign out
              </Button>
            ) : (
              <Button className="mt-4 w-full" onClick={() => navigate("/sign-in")}>
                Sign in
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
