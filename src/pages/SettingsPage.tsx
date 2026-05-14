import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Header } from "@/components/Header";
import { useAppSettings } from "@/hooks/useAppSettings";
import {
  DEFAULT_APP_SETTINGS,
  MOVIE_SORT_OPTIONS,
  TV_SORT_OPTIONS,
  type AnimeLanguagePreference
} from "@/lib/appSettings";
import {
  STREAM_PROVIDERS,
  getGroupedProviders,
  getProviderByKey,
  getProviderCapabilities
} from "../../shared/providerCatalog";
import {
  Button,
  Card,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  ThemeSwitcher
} from "@fishy/ui";
import {
  Check,
  ChevronsUpDown,
  MonitorPlay,
  Palette,
  PlayCircle,
  RotateCcw,
  Tv2,
  Volume2
} from "lucide-react";

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
      <div className="sm:min-w-52 sm:max-w-[18rem]">{control}</div>
    </div>
  );
}

function SettingsSection({
  icon,
  title,
  children
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="surface border-border/70 bg-card/85 p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function ToggleSettingControl({
  id,
  label,
  checked,
  onCheckedChange
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
      <Label htmlFor={id} className="text-sm text-foreground">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ProviderPicker({
  value,
  onValueChange
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const providerGroups = useMemo(() => getGroupedProviders(STREAM_PROVIDERS), []);
  const selectedProvider = value === "auto" ? null : getProviderByKey(value);
  const selectedSummary = selectedProvider ? getProviderCapabilities(selectedProvider)[0] : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between bg-background text-foreground hover:bg-background"
            aria-expanded={open}
          >
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="truncate text-sm font-medium">
                {selectedProvider ? selectedProvider.name : "Auto choose best source"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {selectedProvider ? selectedSummary : "Recommended default"}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Search providers by name or quality" />
          <CommandList className="max-h-96">
            <CommandEmpty>No providers match that search.</CommandEmpty>
            <CommandGroup heading="Recommended">
              <CommandItem
                value="auto recommended default"
                onSelect={() => {
                  onValueChange("auto");
                  setOpen(false);
                }}
                className="flex items-center gap-3"
              >
                <Check className={`h-4 w-4 ${value === "auto" ? "opacity-100" : "opacity-0"}`} />
                <div className="min-w-0">
                  <div className="truncate font-medium">Auto choose best source</div>
                  <div className="truncate text-xs text-muted-foreground">
                    Use the first working provider for each title
                  </div>
                </div>
              </CommandItem>
            </CommandGroup>

            {providerGroups.map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.providers.map((provider) => (
                  <CommandItem
                    key={provider.key}
                    value={`${provider.name} ${provider.key} ${provider.quality}`}
                    onSelect={() => {
                      onValueChange(provider.key);
                      setOpen(false);
                    }}
                    className="flex items-center gap-3"
                  >
                    <Check
                      className={`h-4 w-4 ${value === provider.key ? "opacity-100" : "opacity-0"}`}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{provider.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {getProviderCapabilities(provider).join(" • ")}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function SettingsPage() {
  const { settings, updateSetting, resetSettings } = useAppSettings();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="page-shell page-stack">
        <div className="mb-8 max-w-3xl space-y-2">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                Set the default look, sorting, and playback behavior once. The app uses these
                choices across home, browse, and watch pages.
              </p>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => resetSettings()}
              disabled={JSON.stringify(settings) === JSON.stringify(DEFAULT_APP_SETTINGS)}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset defaults
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
          <SettingsSection icon={<Palette className="h-4 w-4 text-primary" />} title="Appearance">
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
                <ToggleSettingControl
                  id="hero-trailer"
                  label="Enabled"
                  checked={settings.autoPlayHeroTrailer}
                  onCheckedChange={(checked) => updateSetting("autoPlayHeroTrailer", checked)}
                />
              }
            />

            <SettingRow
              label="Mute autoplay trailer"
              description="Keep the featured trailer silent until you explicitly unmute it."
              control={
                <ToggleSettingControl
                  id="hero-muted"
                  label="Start muted"
                  checked={settings.heroTrailerMuted}
                  onCheckedChange={(checked) => updateSetting("heroTrailerMuted", checked)}
                />
              }
            />
          </SettingsSection>

          <SettingsSection icon={<PlayCircle className="h-4 w-4 text-primary" />} title="Home Page">
            <SettingRow
              label="Continue watching row"
              description="Keep your in-progress titles pinned near the top of home when signed in."
              control={
                <ToggleSettingControl
                  id="continue-row"
                  label="Show row"
                  checked={settings.showContinueWatchingRow}
                  onCheckedChange={(checked) => updateSetting("showContinueWatchingRow", checked)}
                />
              }
            />

            <SettingRow
              label="Content sync tools"
              description="Show the TMDB sync panel on the home page for quick library refreshes."
              control={
                <ToggleSettingControl
                  id="sync-panel"
                  label="Show panel"
                  checked={settings.showSyncPanel}
                  onCheckedChange={(checked) => updateSetting("showSyncPanel", checked)}
                />
              }
            />
          </SettingsSection>

          <SettingsSection icon={<Tv2 className="h-4 w-4 text-primary" />} title="Browse Defaults">
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
          </SettingsSection>

          <SettingsSection icon={<MonitorPlay className="h-4 w-4 text-primary" />} title="Playback">
            <SettingRow
              label="Preferred provider"
              description="Search and pin the provider FishyStream should try first when several embeds are available."
              control={
                <ProviderPicker
                  value={settings.defaultProvider}
                  onValueChange={(value) =>
                    updateSetting("defaultProvider", value as typeof settings.defaultProvider)
                  }
                />
              }
            />

            <SettingRow
              label="Preferred anime audio"
              description="Use this when an anime source supports both subtitle and dub playback."
              control={
                <Select
                  value={settings.defaultAnimeLanguage}
                  onValueChange={(value) =>
                    updateSetting("defaultAnimeLanguage", value as AnimeLanguagePreference)
                  }
                >
                  <SelectTrigger className="w-full bg-background text-foreground">
                    <SelectValue placeholder="Choose audio track" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sub">Subtitled first</SelectItem>
                    <SelectItem value="dub">Dub first</SelectItem>
                  </SelectContent>
                </Select>
              }
            />

            <SettingRow
              label="Auto advance episodes"
              description="Move to the next episode automatically near the end of playback when available."
              control={
                <ToggleSettingControl
                  id="auto-advance"
                  label="Advance automatically"
                  checked={settings.autoAdvanceEpisodes}
                  onCheckedChange={(checked) => updateSetting("autoAdvanceEpisodes", checked)}
                />
              }
            />
          </SettingsSection>
        </div>
      </main>
    </div>
  );
}
