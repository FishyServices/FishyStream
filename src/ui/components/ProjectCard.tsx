import { ArrowUpRight } from "lucide-react";

const GITHUB_URL = "https://github.com/FishyServices/FishyStream";

export function ProjectCard() {
  return (
    <section
      className="page-shell-wide border-t border-border/55 pb-10 pt-5 sm:pb-14 sm:pt-6"
      aria-labelledby="project-card-title"
    >
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p id="project-card-title">
          <span className="font-medium text-foreground/75">FishyStream</span>
          <span className="mx-2 text-muted-foreground/35">|</span>
          Open-source streaming platform
        </p>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="focus-ring inline-flex min-h-11 w-fit items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <div className="h-4 w-4" aria-hidden="true" />
          GitHub
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
