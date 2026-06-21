import type { ReactNode } from "react";
import { Button } from "@fishy/ui";

export function PosterSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`poster-skeleton aspect-2/3 rounded-lg ${className}`} aria-hidden="true" />
  );
}

export function RailSkeleton({ count = 8 }: { count?: number }) {
  return (
    <section className="py-2 pb-8 sm:py-3 sm:pb-10" aria-hidden="true">
      <div className="page-shell-wide mb-5 h-7 w-48 rounded-md bg-white/8" />
      <div className="page-shell-wide flex gap-3 overflow-hidden sm:gap-4">
        {Array.from({ length: count }).map((_, index) => (
          <PosterSkeleton
            key={index}
            className="w-[42vw] min-w-37 max-w-53.75 shrink-0 sm:w-46.25 lg:w-53.75"
          />
        ))}
      </div>
    </section>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, index) => (
        <PosterSkeleton key={index} />
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  action
}: {
  icon?: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 items-center justify-center px-6 py-16 text-center">
      <div className="space-y-4">
        {icon ? (
          <div className="mx-auto flex justify-center text-muted-foreground/45">{icon}</div>
        ) : null}
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {action}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  count,
  actions
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
        {count !== undefined ? (
          <p className="mt-1 text-sm text-muted-foreground">{count} titles</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {children}
    </div>
  );
}

export function IconTooltipButton({
  label,
  children,
  className = "",
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button aria-label={label} title={label} className={className} {...props}>
      {children}
    </Button>
  );
}
