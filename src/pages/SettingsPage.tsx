import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Header } from "@/ui/components/Header";
import { useAppSettings } from "@/features/settings/useAppSettings";
import {
  DEFAULT_APP_SETTINGS,
  MOVIE_SORT_OPTIONS,
  TV_SORT_OPTIONS,
  type AnimeLanguagePreference
} from "@/shared/config/appSettings";
import {
  STREAM_PROVIDERS,
  getGroupedProviders,
  getProviderByKey,
  getProviderCapabilities
} from "@fishy/providers/catalog";
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
  CircleGauge,
  MonitorPlay,
  Palette,
  PlayCircle,
  RotateCcw,
  SlidersHorizontal,
  Tv2
} from "lucide-react";

function SettingRow({
  label,
  description,
  control
}: {
  label: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border/60 py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-xl space-y-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="sm:min-w-48 sm:max-w-[16rem]">{control}</div>
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
    <Card className="media-surface overflow-hidden rounded-xl border-border/65 bg-card/78 p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/12 text-primary">
          {icon}
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        </div>
      </div>
      {children}
    </Card>
  );
}

function ToggleSettingControl({
  id,
  checked,
  onCheckedChange
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-end rounded-xl border border-border/65 bg-muted/35 px-3 py-2">
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
            className="w-full justify-between rounded-xl border-border/70 bg-background/70 text-foreground hover:bg-accent"
            aria-expanded={open}
          >
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className="truncate text-sm font-medium">
                {selectedProvider ? selectedProvider.name : "Auto"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {selectedProvider ? selectedSummary : "Best available source"}
              </span>
            </span>
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        }
      />
      <PopoverContent className="w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-xl border-border/70 p-0 shadow-md">
        <Command className="bg-popover">
          <CommandInput placeholder="Search providers" />
          <CommandList className="max-h-96">
            <CommandEmpty>No matches.</CommandEmpty>
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
                  <div className="truncate font-medium">Auto</div>
                  <div className="truncate text-xs text-muted-foreground">
                    First working source for each title
                  </div>
                </div>
              </CommandItem>
            </CommandGroup>

            {providerGroups.map((group) => (
              <CommandGroup key={group.key} heading={group.label}>
                {group.providers.map((provider) => (
                  <CommandItem
                    key={provider.key}
                    value={`${provider.name} ${provider.key}`}
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
    <div className="app-canvas min-h-screen text-foreground">
      <Header />

      <main className="page-shell page-stack">
        <div className="page-intro">
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">Your FishyStream</p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Settings
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Fine-tune how FishyStream looks, browses, and plays on every device.
            </p>
          </div>
          <Button
            variant="outline"
            className="shrink-0 rounded-xl"
            onClick={() => resetSettings()}
            disabled={JSON.stringify(settings) === JSON.stringify(DEFAULT_APP_SETTINGS)}
            aria-label="Reset preferences to defaults"
          >
            <RotateCcw className="mr-2 h-4 w-4" /> Reset
          </Button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
          <SettingsSection icon={<Palette className="h-4 w-4" />} title="Appearance">
            <SettingRow
              label="Theme"
              control={
                <ThemeSwitcher
                  value={settings.theme}
                  onValueChange={(value) => updateSetting("theme", value as typeof settings.theme)}
                />
              }
            />

            <SettingRow
              label="Accent color"
              control={
                <Select
                  value={settings.accent}
                  onValueChange={(value) => updateSetting("accent", value as any)}
                >
                  <SelectTrigger className="w-full rounded-xl border-border/70 bg-background/70 text-foreground">
                    <SelectValue placeholder="Accent" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indigo">Indigo</SelectItem>
                    <SelectItem value="cyan">Cyan</SelectItem>
                    <SelectItem value="rose">Rose</SelectItem>
                    <SelectItem value="emerald">Emerald</SelectItem>
                  </SelectContent>
                </Select>
              }
            />

            <SettingRow
              label="Corner radius"
              control={
                <Select
                  value={settings.radius}
                  onValueChange={(value) => updateSetting("radius", value as any)}
                >
                  <SelectTrigger className="w-full rounded-xl border-border/70 bg-background/70 text-foreground">
                    <SelectValue placeholder="Radius" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sharp">Sharp</SelectItem>
                    <SelectItem value="rounded">Rounded</SelectItem>
                    <SelectItem value="playful">Playful</SelectItem>
                  </SelectContent>
                </Select>
              }
            />

            <SettingRow
              label="Autoplay trailer"
              description="On hero content"
              control={
                <ToggleSettingControl
                  id="hero-trailer"
                  checked={settings.autoPlayHeroTrailer}
                  onCheckedChange={(checked) => updateSetting("autoPlayHeroTrailer", checked)}
                />
              }
            />

            <SettingRow
              label="Start trailers muted"
              control={
                <ToggleSettingControl
                  id="hero-muted"
                  checked={settings.heroTrailerMuted}
                  onCheckedChange={(checked) => updateSetting("heroTrailerMuted", checked)}
                />
              }
            />
          </SettingsSection>

          <div className="space-y-6">
            <SettingsSection icon={<PlayCircle className="h-4 w-4" />} title="Home">
              <SettingRow
                label="Continue watching row"
                control={
                  <ToggleSettingControl
                    id="continue-row"
                    checked={settings.showContinueWatchingRow}
                    onCheckedChange={(checked) => updateSetting("showContinueWatchingRow", checked)}
                  />
                }
              />
            </SettingsSection>

            <SettingsSection icon={<Tv2 className="h-4 w-4" />} title="Browse">
              <SettingRow
                label="Default movie sort"
                control={
                  <Select
                    value={settings.defaultMovieSort}
                    onValueChange={(value) =>
                      updateSetting("defaultMovieSort", value as typeof settings.defaultMovieSort)
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/70 bg-background/70 text-foreground">
                      <SelectValue placeholder="Sort" />
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
                control={
                  <Select
                    value={settings.defaultTVSort}
                    onValueChange={(value) =>
                      updateSetting("defaultTVSort", value as typeof settings.defaultTVSort)
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/70 bg-background/70 text-foreground">
                      <SelectValue placeholder="Sort" />
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
              <SettingRow
                label="Episode ratings"
                description="Show scores and the ratings grid on TV shows"
                control={
                  <ToggleSettingControl
                    id="episode-ratings"
                    checked={settings.showEpisodeRatings}
                    onCheckedChange={(checked) => updateSetting("showEpisodeRatings", checked)}
                  />
                }
              />
            </SettingsSection>

            <SettingsSection icon={<MonitorPlay className="h-4 w-4" />} title="Playback">
              <SettingRow
                label="Preferred provider"
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
                label="Anime audio"
                control={
                  <Select
                    value={settings.defaultAnimeLanguage}
                    onValueChange={(value) =>
                      updateSetting("defaultAnimeLanguage", value as AnimeLanguagePreference)
                    }
                  >
                    <SelectTrigger className="w-full rounded-xl border-border/70 bg-background/70 text-foreground">
                      <SelectValue placeholder="Audio" />
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
                description="Skip to next at 98%"
                control={
                  <ToggleSettingControl
                    id="auto-advance"
                    checked={settings.autoAdvanceEpisodes}
                    onCheckedChange={(checked) => updateSetting("autoAdvanceEpisodes", checked)}
                  />
                }
              />
            </SettingsSection>
          </div>
        </div>
      </main>
    </div>
  );
}
