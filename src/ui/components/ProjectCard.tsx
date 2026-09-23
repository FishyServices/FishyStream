import { ArrowUpRight, Bug, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";

const GITHUB_URL = "https://github.com/FishyServices/FishyStream";
const GITHUB_BUG_REPORT_URL = `${GITHUB_URL}/issues/new?template=bug_report.yml`;

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
        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm">
          <a
            href={GITHUB_BUG_REPORT_URL}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex min-h-11 w-fit items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Bug className="h-3.5 w-3.5" aria-hidden="true" />
            Report Bug
            <ArrowUpRight className="h-3 w-3 text-muted-foreground/70" aria-hidden="true" />
          </a>
          <Link
            to="/dmca"
            className="focus-ring inline-flex min-h-11 w-fit items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            DMCA
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="focus-ring inline-flex min-h-11 w-fit items-center gap-1.5 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            GitHub
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
