import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe, MonitorPlay, Settings2, Sparkles } from "lucide-react";
import type { ProviderGroupedSources } from "@fishy/providers/playback";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@fishy/ui";

export type ProviderUiMode = "custom" | "embedded";
export type ProviderIdType = "anilist" | "mal";

export interface ProviderSourceSelectProps {
  groupedSources: ProviderGroupedSources[];
  selectedSource: string;
  useCustomPlayer: boolean;
  onSelect: (url: string, mode: ProviderUiMode) => void;
  triggerLabel?: string;
  variant?: "header" | "panel";
  className?: string;
  providerIdType?: ProviderIdType;
  onProviderIdTypeChange?: (idType: ProviderIdType) => void;
}

function filterGroupsBycanBeScraped(groups: ProviderGroupedSources[]): ProviderGroupedSources[] {
  return groups
    .map((group) => ({
      ...group,
      providers: group.providers.filter(({ provider }) => provider.canBeScraped)
    }))
    .filter((group) => group.providers.length > 0);
}

export function ProviderSourceSelect({
  groupedSources,
  selectedSource,
  useCustomPlayer,
  onSelect,
  triggerLabel,
  variant = "header",
  className,
  providerIdType = "anilist",
  onProviderIdTypeChange
}: ProviderSourceSelectProps) {
  const isHeader = variant === "header";
  const containerRef = useRef<HTMLDivElement>(null);

  const customGroups = filterGroupsBycanBeScraped(groupedSources);
  const hasCustomOption = customGroups.length > 0;

  const [open, setOpen] = useState(false);
  const [settingsProviderKey, setSettingsProviderKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ProviderUiMode>(
    useCustomPlayer && hasCustomOption ? "custom" : "embedded"
  );

  useEffect(() => {
    if (!open) return;
    setActiveTab(useCustomPlayer && hasCustomOption ? "custom" : "embedded");
  }, [open, useCustomPlayer, hasCustomOption]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const activeGroups = activeTab === "custom" ? customGroups : groupedSources;

  const selectedSourceEntry = groupedSources
    .flatMap((group) => group.providers)
    .flatMap(({ provider, sources }) => sources.map((source) => ({ provider, source })))
    .find(({ source }) => source.url === selectedSource);
  const selectedSourceName = selectedSourceEntry
    ? `${selectedSourceEntry.provider.name}${
        selectedSourceEntry.source.server.id === "default"
          ? ""
          : ` · ${selectedSourceEntry.source.server.label}`
      }`
    : undefined;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          isHeader
            ? "flex w-full items-center justify-start gap-1.5 rounded-md border border-border/80 bg-card/90 px-3 py-2 h-auto text-sm font-normal text-foreground hover:bg-card/90 sm:w-55"
            : "flex w-full items-center justify-start gap-1.5 rounded-lg border border-border/70 bg-card/80 px-2.5 py-2 h-auto text-xs font-normal text-foreground hover:bg-accent"
        }
      >
        <MonitorPlay className={isHeader ? "w-4 h-4 shrink-0" : "w-3.5 h-3.5 shrink-0"} />
        <span className="flex-1 truncate text-left">
          {selectedSourceName ?? triggerLabel ?? "Source"}
        </span>
        {useCustomPlayer && hasCustomOption ? (
          <Sparkles
            className={
              isHeader ? "w-3.5 h-3.5 text-primary shrink-0" : "w-3 h-3 text-primary shrink-0"
            }
          />
        ) : null}
        <ChevronDown
          className={`shrink-0 opacity-60 ${open ? "rotate-180" : ""} ${
            isHeader ? "w-4 h-4" : "w-3.5 h-3.5"
          }`}
        />
      </Button>

      {open ? (
        <div
          role="listbox"
          className={
            isHeader
              ? "absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-md border border-border/80 bg-popover text-popover-foreground shadow-sm"
              : "mt-2 w-full overflow-hidden rounded-xl border border-border/70 bg-popover/98 text-popover-foreground shadow-lg"
          }
        >
          <div
            className={
              isHeader ? "flex border-b border-border/80" : "flex border-b border-border/70"
            }
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => hasCustomOption && setActiveTab("custom")}
              disabled={!hasCustomOption}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-none py-2 h-auto text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                activeTab === "custom"
                  ? "border-b-2 border-primary text-primary hover:text-primary"
                  : isHeader
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Custom
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("embedded")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-none py-2 h-auto text-xs font-medium transition-colors ${
                activeTab === "embedded"
                  ? "border-b-2 border-primary text-primary hover:text-primary"
                  : isHeader
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-transparent"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Embedded
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto overscroll-contain py-1">
            {activeGroups.length === 0 ? (
              <p
                className={
                  isHeader
                    ? "px-3 py-4 text-center text-xs text-muted-foreground"
                    : "px-3 py-4 text-center text-xs text-muted-foreground"
                }
              >
                No sources available
              </p>
            ) : (
              activeGroups.map((group, index) => (
                <Fragment key={group.key}>
                  {index > 0 ? (
                    <div
                      className={
                        isHeader
                          ? "my-1 border-t border-border/80"
                          : "my-1 border-t border-border/70"
                      }
                    />
                  ) : null}
                  <p
                    className={
                      isHeader
                        ? "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                        : "px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    }
                  >
                    {group.label}
                  </p>
                  {group.providers.map(({ provider, sources }) => {
                    const selectedProviderSource = sources.find(
                      (source) => source.url === selectedSource
                    );
                    const displayedSource = selectedProviderSource ?? sources[0];
                    const isSelected =
                      selectedProviderSource !== undefined &&
                      activeTab === (useCustomPlayer ? "custom" : "embedded");

                    return (
                      <div
                        key={provider.key}
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={0}
                        onClick={() => {
                          if (displayedSource) onSelect(displayedSource.url, activeTab);
                          setOpen(false);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          if (displayedSource) onSelect(displayedSource.url, activeTab);
                          setOpen(false);
                        }}
                        className={
                          isHeader
                            ? `flex w-full items-center justify-between gap-2 rounded-none px-3 py-1.5 h-auto text-left text-sm font-normal hover:bg-accent hover:text-accent-foreground ${
                                isSelected ? "text-primary" : "text-popover-foreground"
                              }`
                            : `flex w-full items-center justify-between gap-2 rounded-none px-3 py-1.5 h-auto text-left text-xs font-normal hover:bg-accent ${
                                isSelected ? "text-primary" : "text-popover-foreground"
                              }`
                        }
                      >
                        <span className="min-w-0 flex-1 truncate">{provider.name}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {(provider.servers?.length ?? 0) > 1 ||
                          (provider.getMalAnimeTVUrl && onProviderIdTypeChange) ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`${provider.name} settings`}
                              title={`${provider.name} settings`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSettingsProviderKey(provider.key);
                              }}
                              className={`h-6 w-6 ${isSelected ? "text-primary" : "opacity-60"}`}
                            >
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                          {isSelected ? <Check className="w-3.5 h-3.5" /> : null}
                        </span>
                      </div>
                    );
                  })}
                </Fragment>
              ))
            )}
          </div>
        </div>
      ) : null}

      <Dialog
        open={settingsProviderKey !== null}
        onOpenChange={(isOpen) => !isOpen && setSettingsProviderKey(null)}
      >
        <DialogContent
          data-content-modal="true"
          className="border-border/80 bg-card text-card-foreground"
        >
          <DialogHeader>
            <DialogTitle>
              {settingsProviderKey
                ? groupedSources
                    .flatMap((group) => group.providers)
                    .find((set) => set.provider.key === settingsProviderKey)?.provider.name
                : "Provider"}{" "}
              settings
            </DialogTitle>
            <DialogDescription>
              Choose the server and anime ID this provider should use.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const providerSet = groupedSources
              .flatMap((group) => group.providers)
              .find((set) => set.provider.key === settingsProviderKey);
            if (!providerSet) return null;

            const currentServer = providerSet.sources.find(
              (source) => source.url === selectedSource
            )?.server.id;

            return (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Server</p>
                  <div className="grid gap-2">
                    {providerSet.sources.map((source) => (
                      <Button
                        key={source.url}
                        type="button"
                        variant={currentServer === source.server.id ? "default" : "outline"}
                        className="justify-between"
                        onClick={() => {
                          onSelect(source.url, activeTab);
                          setSettingsProviderKey(null);
                          setOpen(false);
                        }}
                      >
                        {source.server.label}
                        {currentServer === source.server.id ? <Check className="h-4 w-4" /> : null}
                      </Button>
                    ))}
                  </div>
                </div>
                {providerSet.provider.getMalAnimeTVUrl && onProviderIdTypeChange ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Anime ID</p>
                    <div className="grid gap-2">
                      {(["anilist", "mal"] as const).map((idType) => (
                        <Button
                          key={idType}
                          type="button"
                          variant={providerIdType === idType ? "default" : "outline"}
                          className="justify-between"
                          onClick={() => onProviderIdTypeChange(idType)}
                        >
                          {idType === "anilist" ? "AniList" : "MyAnimeList (MAL)"}
                          {providerIdType === idType ? <Check className="h-4 w-4" /> : null}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
