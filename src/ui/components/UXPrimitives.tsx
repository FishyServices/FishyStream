import type { ReactNode } from "react";
import { Button } from "@fishy/ui";

export function PosterSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`poster-skeleton aspect-2/3 w-full min-w-0 rounded-xl border border-border/55 bg-card/80 shadow-md ${className}`}
      aria-hidden="true"
    />
  );
}

export function RailSkeleton({ count = 8 }: { count?: number }) {
  return (
    <section className="py-5 pb-9 sm:py-7 sm:pb-12" aria-hidden="true">
      <div className="page-shell-wide poster-skeleton mb-4 h-7 w-44 rounded-xl border border-border/55 bg-card/60 sm:mb-5 sm:h-8" />
      <div className="page-shell-wide relative pt-2">
        <div className="flex gap-3 overflow-hidden px-1 pb-4 sm:gap-4 sm:px-0">
          {Array.from({ length: count }).map((_, index) => (
            <PosterSkeleton
              key={index}
              className="w-[42vw] min-w-37 max-w-53.75 shrink-0 sm:w-46.25 lg:w-53.75"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type GridSkeletonVariant = "grid" | "library" | "picks";

const gridSkeletonClassName =
  "grid min-w-0 grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

function SkeletonGrid({
  count,
  className = gridSkeletonClassName
}: {
  count: number;
  className?: string;
}) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <PosterSkeleton key={index} />
      ))}
    </div>
  );
}

export function GridSkeleton({
  count = 12,
  variant = "grid"
}: {
  count?: number;
  variant?: GridSkeletonVariant;
}) {
  if (variant === "picks") {
    return (
      <div aria-hidden="true">
        <div className="page-intro">
          <div className="poster-skeleton h-10 w-32 rounded-xl border border-border/55 bg-card/60 sm:h-11 sm:w-40" />
        </div>
        <div className="space-y-10 sm:space-y-12">
          {Array.from({ length: 3 }).map((_, index) => (
            <section
              key={index}
              className="rounded-2xl border border-border/55 bg-card/28 p-4 sm:p-5"
            >
              <div className="mb-5 flex items-center gap-3 border-b border-border/55 pb-4">
                <div className="poster-skeleton h-9 w-9 shrink-0 rounded-xl border border-border/55 bg-card/60" />
                <div className="poster-skeleton h-7 w-40 rounded-lg border border-border/55 bg-card/60" />
              </div>
              <SkeletonGrid
                count={count}
                className={`${gridSkeletonClassName} lg:gap-x-5 2xl:grid-cols-7 2xl:gap-x-6`}
              />
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "library") {
    return (
      <div aria-hidden="true">
        <div className="page-intro">
          <div className="poster-skeleton h-10 w-40 rounded-xl border border-border/55 bg-card/60 sm:h-11 sm:w-48" />
          <div className="poster-skeleton h-10 w-24 shrink-0 self-end rounded-xl border border-border/55 bg-card/60 sm:self-auto" />
        </div>
        <div className="space-y-8">
          <section className="media-surface space-y-4 rounded-2xl border-border/65 bg-card/55 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="poster-skeleton h-9 w-20 rounded-xl border border-border/55 bg-card/60" />
              <div className="poster-skeleton h-9 w-24 rounded-xl border border-border/55 bg-card/60" />
              <div className="poster-skeleton h-9 w-28 rounded-xl border border-border/55 bg-card/60" />
            </div>
            <SkeletonGrid count={count} />
          </section>
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true">
      <SkeletonGrid count={count} />
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
