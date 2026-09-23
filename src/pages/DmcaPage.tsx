import { Header } from "@/ui/components/Header";
import { ProjectCard } from "@/ui/components/ProjectCard";
import { PageHeader } from "@/ui/components/UXPrimitives";
import { useSeoMeta } from "@/shared/seo/useSeoMeta";
import { Button } from "@fishy/ui";
import { ArrowUpRight, Bug, ShieldAlert } from "lucide-react";

const GITHUB_REPO_URL = "https://github.com/FishyServices/FishyStream";
const GITHUB_BUG_REPORT_URL = `${GITHUB_REPO_URL}/issues/new?template=bug_report.yml`;
const GITHUB_DMCA_URL = `${GITHUB_REPO_URL}/issues/new?template=dmca_takedown.yml`;

export function DmcaPage() {
  useSeoMeta({
    title: "DMCA & Legal Notice",
    description: "FishyStream service model, copyright policy, and takedown procedures.",
    path: "/dmca"
  });

  return (
    <div className="app-canvas min-h-screen text-foreground">
      <Header />

      <main className="page-shell-wide page-stack pb-20">
        <PageHeader
          title="DMCA & Copyright"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={GITHUB_BUG_REPORT_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex"
              >
                <Button variant="outline" size="sm" className="rounded-xl">
                  <Bug className="mr-2 h-4 w-4" /> Report bug
                </Button>
              </a>
              <a href={GITHUB_DMCA_URL} target="_blank" rel="noreferrer" className="inline-flex">
                <Button variant="secondary" size="sm" className="rounded-xl">
                  <ShieldAlert className="mr-2 h-4 w-4 text-destructive" /> Takedown form
                  <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </a>
            </div>
          }
        />

        <div className="space-y-8">
          <div className="rounded-xl border border-border/70 bg-card/40 p-4 text-sm text-muted-foreground sm:p-5">
            <span className="font-semibold text-foreground">Please note:</span> FishyStream does not
            host any files itself. It only indexes and embeds content from third-party providers.
            Legal issues should be taken up with the host where files are stored.
          </div>

          <section className="media-surface rounded-xl border-border/55 bg-card/50 p-5 sm:p-7">
            <div className="mb-4 border-b border-border/55 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Service model
              </p>
              <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
                How we operate
              </h2>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                FishyStream functions as a search engine and content aggregator that indexes
                publicly available media from across the web.
              </p>
              <p>
                We do not host, store, or control any media files. Everything comes from external
                third-party websites that are already publicly accessible.
              </p>
              <p>
                Our systems simply provide links to content that is already available online,
                without bypassing any security measures.
              </p>
            </div>
          </section>

          <section className="media-surface rounded-xl border-border/55 bg-card/50 p-5 sm:p-7">
            <div className="mb-4 border-b border-border/55 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Copyright policy
              </p>
              <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
                Content &amp; copyright
              </h2>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                We are a search index. The actual video files live on third-party hosts that we do
                not own and do not control. We point at them. If a file disappears upstream, our
                link breaks the same day. The host is the only party who can take a file down.
              </p>
              <p>
                That said, we do not want to make life harder for rights holders. If you own the
                rights to a title and send us a notice with enough detail to identify it, we will
                delist it from our search so it cannot be reached from anywhere on the site. We will
                also tell you which upstream sources we were pulling it from, so you can chase the
                files at their actual source.
              </p>
              <p>
                Blocking a title here will not make it disappear from the internet. It only stops
                users from finding it through us. That is the part we control, and we act on it in
                good faith.
              </p>
            </div>
          </section>

          <section className="media-surface rounded-xl border-border/55 bg-card/50 p-5 sm:p-7">
            <div className="mb-4 border-b border-border/55 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Legal contact
              </p>
              <h2 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
                Legal inquiries
              </h2>
            </div>
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                For DMCA notices, takedown requests, or anything legal-related, use our GitHub issue
                forms or contact the project repository.
              </p>
              <p>
                To help us turn things around quickly, include the title and year, an IMDb or TMDB
                ID if you have one, and a brief statement that you own the rights (or are authorised
                to act for the rights holder). Once we have confirmed the claim, we will delist the
                title from our search and reply with the upstream hosts we were pointing at, so you
                can pursue the actual files at their source.
              </p>
              <p>
                We try to acknowledge requests within a couple of days. Good faith on both sides
                goes a long way.
              </p>

              <div className="pt-2">
                <a href={GITHUB_DMCA_URL} target="_blank" rel="noreferrer" className="inline-flex">
                  <Button variant="outline" className="rounded-xl">
                    <ShieldAlert className="mr-2 h-4 w-4 text-destructive" />
                    Open GitHub Takedown Request Form
                    <ArrowUpRight className="ml-2 h-4 w-4" />
                  </Button>
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>

      <ProjectCard />
    </div>
  );
}

export default DmcaPage;
