import type { ReactNode } from "react";
import { Button } from "@fishy/ui";

export function PosterSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`poster-skeleton aspect-2/3 rounded-xl border border-border/45 ${className}`}
      aria-hidden="true"
    />
  );
}

export function RailSkeleton({ count = 8 }: { count?: number }) {
  return (
    <section className="py-2 pb-8 sm:py-3 sm:pb-10" aria-hidden="true">
      <div className="page-shell-wide mb-4 h-6 w-40 rounded-md bg-muted" />
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
    <div className="flex min-h-56 items-center justify-center px-6 py-14 text-center">
      <div className="max-w-sm space-y-3">
        {icon ? (
          <div className="mx-auto flex justify-center text-muted-foreground/40">{icon}</div>
        ) : null}
        <p className="text-sm font-medium text-foreground">{title}</p>
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
    <div className="page-intro">
      <div className="min-w-0 flex items-baseline gap-2">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title}
          </h1>
        </div>
        {count !== undefined ? (
          <span className="text-sm text-muted-foreground">{count}</span>
        ) : null}
      </div>
      {actions ? <div className="shrink-0 self-end sm:self-auto">{actions}</div> : null}
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">{children}</div>;
}

export function IconTooltipButton({
  label,
  children,
  className = "",
  ...props
}: React.ComponentProps<typeof Button> & { label: string }) {
  return (
    <Button
      aria-label={label}
      title={label}
      className={`min-h-11 min-w-11 ${className}`}
      {...props}
    >
      {children}
    </Button>
  );
}
