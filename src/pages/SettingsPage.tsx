import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { useAppSettings } from "@/hooks/useAppSettings";
import { MOVIE_SORT_OPTIONS, TV_SORT_OPTIONS } from "@/lib/appSettings";
import { STREAM_PROVIDERS } from "../../shared/providerCatalog";
import {
  Card,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ThemeSwitcher
} from "@fishy/ui";
import { MonitorPlay, Palette, PlayCircle, Tv2 } from "lucide-react";

function SettingRow({
  label,
  description,
  control
}: {
  label: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-t border-border/70 py-5 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl space-y-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="sm:min-w-[13rem] sm:max-w-[18rem]">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  const { settings, updateSetting } = useAppSettings();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="page-shell page-stack">
        <div className="mb-8 max-w-3xl space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Set the default look, sorting, and playback behavior once. The app uses these choices
            across home, browse, and watch pages.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <Card className="surface border-border/70 bg-card/85 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Appearance</h2>
            </div>

            <SettingRow
              label="Theme"
              description="Switch FishyStream between a low-light theater view and a bright daytime layout."
              control={
                <ThemeSwitcher
                  value={settings.theme}
                  onValueChange={(value) => updateSetting("theme", value as typeof settings.theme)}
                />
              }
            />

            <SettingRow
              label="Autoplay featured trailer"
              description="Start the hero trailer automatically on the home page when the title has one."
              control={
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
                  <Label htmlFor="hero-trailer" className="text-sm text-foreground">
                    Enabled
                  </Label>
                  <Switch
                    id="hero-trailer"
                    checked={settings.autoPlayHeroTrailer}
                    onCheckedChange={(checked) => updateSetting("autoPlayHeroTrailer", checked)}
                  />
                </div>
              }
            />
          </Card>

          <Card className="surface border-border/70 bg-card/85 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Home Page</h2>
            </div>

            <SettingRow
              label="Continue watching row"
              description="Keep your in-progress titles pinned near the top of home when signed in."
              control={
                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
                  <Label htmlFor="continue-row" className="text-sm text-foreground">
                    Show row
                  </Label>
                  <Switch
                    id="continue-row"
                    checked={settings.showContinueWatchingRow}
                    onCheckedChange={(checked) => updateSetting("showContinueWatchingRow", checked)}
                  />
                </div>
              }
            />
          </Card>

          <Card className="surface border-border/70 bg-card/85 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <Tv2 className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Browse Defaults</h2>
            </div>

            <SettingRow
              label="Default movie sort"
              description="Used on the Movies page whenever the URL does not already specify a sort."
              control={
                <Select
                  value={settings.defaultMovieSort}
                  onValueChange={(value) =>
                    updateSetting("defaultMovieSort", value as typeof settings.defaultMovieSort)
                  }
                >
                  <SelectTrigger className="w-full bg-background text-foreground">
                    <SelectValue placeholder="Select movie sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVIE_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />

            <SettingRow
              label="Default TV sort"
              description="Used on the TV Shows page whenever the URL does not already specify a sort."
              control={
                <Select
                  value={settings.defaultTVSort}
                  onValueChange={(value) =>
                    updateSetting("defaultTVSort", value as typeof settings.defaultTVSort)
                  }
                >
                  <SelectTrigger className="w-full bg-background text-foreground">
                    <SelectValue placeholder="Select TV sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {TV_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          </Card>

          <Card className="surface border-border/70 bg-card/85 p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-2">
              <MonitorPlay className="h-4 w-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Playback</h2>
            </div>

            <SettingRow
              label="Preferred provider"
              description="When a title has several embeds, FishyStream will try this provider first."
              control={
                <Select
                  value={settings.defaultProvider}
                  onValueChange={(value) =>
                    updateSetting("defaultProvider", value as typeof settings.defaultProvider)
                  }
                >
                  <SelectTrigger className="w-full bg-background text-foreground">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto choose best source</SelectItem>
                    {STREAM_PROVIDERS.map((provider) => (
                      <SelectItem key={provider.key} value={provider.key}>
                        {provider.name} ({provider.quality})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            />
          </Card>
        </div>
      </main>
    </div>
  );
}
