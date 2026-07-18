import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Globe, MonitorPlay, Sparkles } from "lucide-react";
import { getProviderByKey } from "@fishy/providers/catalog";
import { Button } from "@fishy/ui";

export interface ProviderSourceOption {
  key: string;
  name: string;
  url: string;
}

export interface ProviderSourceGroup {
  key: string;
  label: string;
  sources: ProviderSourceOption[];
}

export type ProviderUiMode = "custom" | "embedded";

export interface ProviderSourceSelectProps {
  groupedSources: ProviderSourceGroup[];
  selectedSource: string;
  useCustomPlayer: boolean;
  onSelect: (url: string, mode: ProviderUiMode) => void;
  triggerLabel?: string;
  variant?: "header" | "panel";
  className?: string;
}

function filterGroupsBySupportsCustomUI(groups: ProviderSourceGroup[]): ProviderSourceGroup[] {
  return groups
    .map((group) => ({
      ...group,
      sources: group.sources.filter((source) => getProviderByKey(source.key)?.supportsCustomUI)
    }))
    .filter((group) => group.sources.length > 0);
}

export function ProviderSourceSelect({
  groupedSources,
  selectedSource,
  useCustomPlayer,
  onSelect,
  triggerLabel,
  variant = "header",
  className
}: ProviderSourceSelectProps) {
  const isHeader = variant === "header";
  const containerRef = useRef<HTMLDivElement>(null);

  const customGroups = filterGroupsBySupportsCustomUI(groupedSources);
  const hasCustomOption = customGroups.length > 0;

  const [open, setOpen] = useState(false);
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

  const selectedSourceName = groupedSources
    .flatMap((group) => group.sources)
    .find((source) => source.url === selectedSource)?.name;

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
            : "flex w-full items-center justify-start gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-2 h-auto text-xs font-normal text-white hover:bg-black/40"
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
          className={`shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""} ${
            isHeader ? "w-4 h-4" : "w-3.5 h-3.5"
          }`}
        />
      </Button>

      {open ? (
        <div
          role="listbox"
          className={
            isHeader
              ? "absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-md border border-border/80 bg-popover text-popover-foreground shadow-xl"
              : "absolute bottom-full right-0 z-50 mb-2 w-64 overflow-hidden rounded-lg border border-white/10 bg-neutral-950/95 text-white shadow-2xl backdrop-blur-md"
          }
        >
          <div
            className={
              isHeader ? "flex border-b border-border/80" : "flex border-b border-white/10"
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
                    : "text-white/50 hover:text-white hover:bg-transparent"
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
                    : "text-white/50 hover:text-white hover:bg-transparent"
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              Embedded
            </Button>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {activeGroups.length === 0 ? (
              <p
                className={
                  isHeader
                    ? "px-3 py-4 text-center text-xs text-muted-foreground"
                    : "px-3 py-4 text-center text-xs text-white/50"
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
                          : "my-1 border-t border-white/10"
                      }
                    />
                  ) : null}
                  <p
                    className={
                      isHeader
                        ? "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                        : "px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-white/40"
                    }
                  >
                    {group.label}
                  </p>
                  {group.sources.map((source) => {
                    const isSelected =
                      source.url === selectedSource &&
                      activeTab === (useCustomPlayer ? "custom" : "embedded");
                    return (
                      <Button
                        key={source.url}
                        type="button"
                        variant="ghost"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onSelect(source.url, activeTab);
                          setOpen(false);
                        }}
                        className={
                          isHeader
                            ? `flex w-full items-center justify-between gap-2 rounded-none px-3 py-1.5 h-auto text-left text-sm font-normal hover:bg-accent hover:text-accent-foreground ${
                                isSelected ? "text-primary" : "text-popover-foreground"
                              }`
                            : `flex w-full items-center justify-between gap-2 rounded-none px-3 py-1.5 h-auto text-left text-xs font-normal hover:bg-neutral-800 ${
                                isSelected ? "text-primary" : "text-white"
                              }`
                        }
                      >
                        <span className="truncate">{source.name}</span>
                        {isSelected ? <Check className="w-3.5 h-3.5 shrink-0" /> : null}
                      </Button>
                    );
                  })}
                </Fragment>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
