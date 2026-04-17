import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useUser } from "@clerk/react";
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  CirclePlay,
  Database,
  FileJson,
  History,
  Loader2,
  Upload
} from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "../../convex/_generated/api";

type ImportedMedia = {
  tmdbId: string;
  title: string;
  year?: number;
  posterUrl?: string;
  type: "movie" | "tv";
};

type ImportedPlayback = ImportedMedia & {
  watched: number;
  duration: number;
  timestamp: number;
  completed: boolean;
  seasonNumber?: number;
  episodeNumber?: number;
};

type PStreamBookmark = {
  type?: string;
  title?: string;
  year?: number;
  poster?: string;
};

type PStreamProgressMedia = {
  type?: string;
  title?: string;
  year?: number;
  poster?: string;
  updatedAt?: number;
  progress?: {
    watched?: number;
    duration?: number;
  };
  episodes?: Record<
    string,
    {
      id?: string;
      number?: number;
      seasonId?: string;
      updatedAt?: number;
      progress?: {
        watched?: number;
        duration?: number;
      };
    }
  >;
  seasons?: Record<
    string,
    {
      id?: string;
      number?: number;
      title?: string;
    }
  >;
};

type PStreamWatchHistoryItem = {
  type?: string;
  title?: string;
  year?: number;
  poster?: string;
  watchedAt?: number;
  completed?: boolean;
  episodeId?: string;
  seasonId?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  progress?: {
    watched?: number;
    duration?: number;
  };
};

type PStreamExport = {
  bookmarks?: Record<string, PStreamBookmark>;
  progress?: Record<string, PStreamProgressMedia>;
  watchHistory?: Record<string, PStreamWatchHistoryItem>;
  exportDate?: string;
};

type MigrationPreview = {
  bookmarks: ImportedMedia[];
  progress: ImportedPlayback[];
  history: ImportedPlayback[];
  unresolvedShowHistory: number;
  exportDate?: string;
  rawCounts: {
    bookmarks: number;
    progress: number;
    watchHistory: number;
  };
};

function toMediaType(type: string | undefined): "movie" | "tv" | null {
  if (type === "movie") return "movie";
  if (type === "show" || type === "tv") return "tv";
  return null;
}

function normalizePositiveNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function buildShowLookup(raw: PStreamExport): Map<string, string> {
  const lookup = new Map<string, string>();

  const addEntry = (tmdbId: string, title?: string, year?: number, type?: string) => {
    if (!title || toMediaType(type) !== "tv") return;
    lookup.set(`${title.toLowerCase()}::${year ?? ""}`, tmdbId);
    lookup.set(title.toLowerCase(), tmdbId);
  };

  for (const [tmdbId, bookmark] of Object.entries(raw.bookmarks || {})) {
    addEntry(tmdbId, bookmark.title, bookmark.year, bookmark.type);
  }

  for (const [tmdbId, progress] of Object.entries(raw.progress || {})) {
    addEntry(tmdbId, progress.title, progress.year, progress.type);
  }

  return lookup;
}

function getShowTmdbIdFromHistoryKey(
  key: string,
  item: PStreamWatchHistoryItem,
  showLookup: Map<string, string>
): string | undefined {
  const directMatch = key.match(/^(\d+)(?:-\d+)?$/);
  if (directMatch) {
    return directMatch[1];
  }

  if (!item.title) return undefined;

  return (
    showLookup.get(`${item.title.toLowerCase()}::${item.year ?? ""}`) ||
    showLookup.get(item.title.toLowerCase())
  );
}

function parseExport(raw: PStreamExport): MigrationPreview {
  const bookmarks: ImportedMedia[] = [];
  for (const [tmdbId, item] of Object.entries(raw.bookmarks || {})) {
    const type = toMediaType(item.type);
    if (!type || !item.title) continue;

    bookmarks.push({
      tmdbId,
      title: item.title,
      year: item.year,
      posterUrl: item.poster,
      type
    });
  }

  const progress: ImportedPlayback[] = [];
  for (const [tmdbId, item] of Object.entries(raw.progress || {})) {
    const type = toMediaType(item.type);
    if (!type || !item.title) continue;

    if (type === "movie") {
      const watched = normalizePositiveNumber(item.progress?.watched);
      const duration = normalizePositiveNumber(item.progress?.duration);
      if (!watched && !duration) continue;

      progress.push({
        tmdbId,
        title: item.title,
        year: item.year,
        posterUrl: item.poster,
        type,
        watched,
        duration,
        timestamp: normalizePositiveNumber(item.updatedAt) || Date.now(),
        completed: duration > 0 && watched / duration >= 0.95
      });
      continue;
    }

    const latestEpisode = Object.values(item.episodes || {}).sort(
      (a, b) => normalizePositiveNumber(b.updatedAt) - normalizePositiveNumber(a.updatedAt)
    )[0];

    if (!latestEpisode) continue;

    const watched = normalizePositiveNumber(latestEpisode.progress?.watched);
    const duration = normalizePositiveNumber(latestEpisode.progress?.duration);
    if (!watched && !duration) continue;

    progress.push({
      tmdbId,
      title: item.title,
      year: item.year,
      posterUrl: item.poster,
      type,
      watched,
      duration,
      timestamp: normalizePositiveNumber(latestEpisode.updatedAt) || Date.now(),
      completed: duration > 0 && watched / duration >= 0.95,
      seasonNumber:
        latestEpisode.seasonId && item.seasons?.[latestEpisode.seasonId]?.number
          ? normalizePositiveNumber(item.seasons[latestEpisode.seasonId]?.number)
          : undefined,
      episodeNumber: normalizePositiveNumber(latestEpisode.number) || undefined
    });
  }

  const showLookup = buildShowLookup(raw);
  const latestHistoryByTmdb = new Map<string, ImportedPlayback>();
  let unresolvedShowHistory = 0;

  for (const [key, item] of Object.entries(raw.watchHistory || {})) {
    const type = toMediaType(item.type);
    if (!type || !item.title) continue;

    const tmdbId =
      type === "movie"
        ? key
        : getShowTmdbIdFromHistoryKey(key, item, showLookup);

    if (!tmdbId) {
      unresolvedShowHistory += 1;
      continue;
    }

    const watched = normalizePositiveNumber(item.progress?.watched);
    const duration = normalizePositiveNumber(item.progress?.duration);
    const historyItem: ImportedPlayback = {
      tmdbId,
      title: item.title,
      year: item.year,
      posterUrl: item.poster,
      type,
      watched,
      duration,
      timestamp: normalizePositiveNumber(item.watchedAt) || Date.now(),
      completed: Boolean(item.completed),
      seasonNumber: normalizePositiveNumber(item.seasonNumber) || undefined,
      episodeNumber: normalizePositiveNumber(item.episodeNumber) || undefined
    };

    const existing = latestHistoryByTmdb.get(tmdbId);
    if (!existing || historyItem.timestamp > existing.timestamp) {
      latestHistoryByTmdb.set(tmdbId, historyItem);
    }
  }

  return {
    bookmarks,
    progress,
    history: Array.from(latestHistoryByTmdb.values()),
    unresolvedShowHistory,
    exportDate: raw.exportDate,
    rawCounts: {
      bookmarks: Object.keys(raw.bookmarks || {}).length,
      progress: Object.keys(raw.progress || {}).length,
      watchHistory: Object.keys(raw.watchHistory || {}).length
    }
  };
}

async function loadExportFromFile(file: File): Promise<MigrationPreview> {
  const raw = JSON.parse(await file.text()) as PStreamExport;
  return parseExport(raw);
}

function StatCard({
  icon,
  label,
  value,
  tone = "default"
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "warning" ? "border-warning/30 bg-warning-soft" : "border-border-soft bg-card/80"
      }`}
    >
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="text-primary">{icon}</div>
        <span>{label}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function MigrationPage() {
  const { user, isSignedIn } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importExport = useMutation(api.migration.importPStreamExport);
  const [preview, setPreview] = useState<MigrationPreview | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [importState, setImportState] = useState<"idle" | "importing" | "success" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoadState("loading");
        if (cancelled) return;
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        setLoadState("error");
        setMessage(error instanceof Error ? error.message : "Failed to load p-stream export.");
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const previewSummary = useMemo(() => {
    if (!preview) return null;
    return {
      bookmarks: preview.bookmarks.length,
      progress: preview.progress.length,
      history: preview.history.length,
      unresolved: preview.unresolvedShowHistory
    };
  }, [preview]);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setLoadState("loading");
      const parsed = await loadExportFromFile(file);
      setPreview(parsed);
      setLoadState("ready");
      setMessage("");
    } catch (error) {
      setLoadState("error");
      setMessage(error instanceof Error ? error.message : "Failed to parse selected export.");
    }
  };

  const handleImport = async () => {
    if (!user || !preview) return;

    try {
      setImportState("importing");
      const result = await importExport({
        clerkUserId: user.id,
        bookmarks: preview.bookmarks,
        progress: preview.progress,
        history: preview.history
      });

      setImportState("success");
      setMessage(
        `Imported ${result.importedWatchlist} watchlist items, ${result.importedHistory} history items, and created ${result.createdContent} new titles.`
      );
    } catch (error) {
      setImportState("error");
      setMessage(error instanceof Error ? error.message : "Migration import failed.");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-28 sm:px-6 lg:px-12">
        <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <Badge variant="secondary" className="bg-primary-soft text-primary">
              p-stream migration
            </Badge>

            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
                Import your p-stream library into FishyStream without rebuilding it by hand.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                This page reads your export, imports bookmarks and playback state into Convex, and
                keeps the latest saved season and episode on TV rows so continue watching reopens
                the right episode.
              </p>
            </div>

            {previewSummary && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={<Bookmark className="h-4 w-4" />}
                  label="Watchlist ready"
                  value={previewSummary.bookmarks}
                />
                <StatCard
                  icon={<CirclePlay className="h-4 w-4" />}
                  label="Continue watching"
                  value={previewSummary.progress}
                />
                <StatCard
                  icon={<History className="h-4 w-4" />}
                  label="History rows"
                  value={previewSummary.history}
                />
                <StatCard
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label="Skipped show rows"
                  value={previewSummary.unresolved}
                  tone="warning"
                />
              </div>
            )}
          </div>

          <Card className="border-border-soft bg-card/90 backdrop-blur">
            <CardHeader>
              <CardTitle>Migration control</CardTitle>
              <CardDescription>
                Load the export, review the mapped totals, then import everything into your
                signed-in profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileChange}
              />

              <div className="rounded-2xl border border-border-soft bg-background/60 p-4">
                <div className="flex items-start gap-3">
                  <FileJson className="mt-0.5 h-5 w-5 text-primary" />
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Export file</p>
                    <p className="text-sm text-muted-foreground">Exported</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={handleUploadClick}>
                  <Upload className="h-4 w-4" />
                  Choose export file
                </Button>
              </div>

              {loadState === "loading" && (
                <div className="flex items-center gap-3 rounded-2xl border border-border-soft bg-background/60 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  Reading p-stream export...
                </div>
              )}

              {message && (
                <Alert
                  variant={
                    importState === "error" || loadState === "error" ? "destructive" : "default"
                  }
                >
                  {importState === "success" ? (
                    <CheckCircle2 className="text-success" />
                  ) : (
                    <AlertTriangle />
                  )}
                  <AlertTitle>
                    {importState === "success"
                      ? "Import complete"
                      : loadState === "error" || importState === "error"
                        ? "Action failed"
                        : "Status"}
                  </AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              )}

              <Alert className="border-warning/20 bg-warning-soft">
                <AlertTriangle className="text-warning" />
                <AlertTitle>TV history behavior</AlertTitle>
                <AlertDescription>
                  FishyStream stores one watch-history/progress row per title, not per episode. TV
                  imports keep the latest saved season and episode for each show so resume targets
                  the right entry point.
                </AlertDescription>
              </Alert>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-3">
              {isSignedIn ? (
                <Button
                  className="w-full"
                  onClick={handleImport}
                  disabled={!preview || loadState !== "ready" || importState === "importing"}
                >
                  {importState === "importing" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing into FishyStream
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4" />
                      Import into my account
                    </>
                  )}
                </Button>
              ) : (
                <Button className="w-full" onClick={() => (window.location.href = "/sign-in")}>
                  Sign in to import
                </Button>
              )}
            </CardFooter>
          </Card>
        </section>

        {preview && (
          <section className="mt-8 grid gap-6 lg:grid-cols-3">
            <Card className="border-border-soft bg-card/85">
              <CardHeader>
                <CardTitle>Raw export</CardTitle>
                <CardDescription>Counts straight from the p-stream JSON file.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Bookmarks</span>
                  <span className="font-medium text-foreground">{preview.rawCounts.bookmarks}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Progress rows</span>
                  <span className="font-medium text-foreground">{preview.rawCounts.progress}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Watch history rows</span>
                  <span className="font-medium text-foreground">
                    {preview.rawCounts.watchHistory}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border-soft bg-card/85">
              <CardHeader>
                <CardTitle>Imported totals</CardTitle>
                <CardDescription>
                  What will be written into your FishyStream account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>My List entries</span>
                  <span className="font-medium text-foreground">{preview.bookmarks.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Continue watching rows</span>
                  <span className="font-medium text-foreground">{preview.progress.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Watch history rows</span>
                  <span className="font-medium text-foreground">{preview.history.length}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-warning/20 bg-card/85">
              <CardHeader>
                <CardTitle>Skipped entries</CardTitle>
                <CardDescription>
                  Rows that still could not be mapped safely to a FishyStream title.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Episode history without show TMDB id</span>
                  <span className="font-medium text-foreground">
                    {preview.unresolvedShowHistory}
                  </span>
                </div>
                <p>
                  These are left out on purpose instead of guessing the wrong show and corrupting
                  your history.
                </p>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
