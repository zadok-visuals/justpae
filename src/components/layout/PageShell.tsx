import { MobileTopBar } from "@/components/layout/DashboardChrome";
import { PageTitlePublisher } from "@/components/layout/PageTitleContext";
import { BackButton } from "@/components/ui/BackButton";

/**
 * The content column every dashboard page sits in.
 *
 * max-w-2xl rather than full width: a money form read at 1440px should not
 * stretch a label to one edge and its value to the other. The column is the
 * same width on every page so moving between them doesn't reflow the reading
 * position.
 */
export function PageShell({
  title,
  subtitle,
  back,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  /**
   * GROUP 5b. `href` is the FALLBACK destination, not the destination: Back
   * walks the session's own history when the previous entry is a page of
   * ours, and uses this only when there is none (a deep link, a cold load, a
   * push notification). Shown at every viewport size now, not just mobile.
   */
  back?: { href: string; label: string };
  children: React.ReactNode;
  /** For the activity list and admin tables, which want the room. */
  wide?: boolean;
}) {
  return (
    <>
      {/* Publishes to the desktop TopBar; renders nothing itself. On mobile
          the title still comes from MobileTopBar below, not this. */}
      <PageTitlePublisher title={title} />
      <MobileTopBar title={title} />

      <div className={`mx-auto w-full px-4 py-5 sm:px-6 sm:py-8 ${wide ? "max-w-4xl" : "max-w-2xl"}`}>
        {/* GROUP 5b/5c. Was a mobile-only (`sm:hidden`) grey link to a
            hard-coded `back.href`. Two changes:

            SHOWN AT EVERY SIZE. The reasoning for hiding it on desktop was
            that the sidebar is there to navigate with — but the sidebar holds
            top-level destinations, and Back is for the page you were just on,
            which no sidebar can offer. On a 1440px window the browser's own
            Back control is also the furthest thing on screen from the content.

            `back.href` IS NOW ONLY THE FALLBACK. The real destination is the
            previous history entry when it is one of ours; the prop is what
            answers a deep link or a cold load. Every existing caller keeps
            working unchanged and simply gets more accurate behaviour. */}
        {back && (
          <BackButton fallbackHref={back.href} label={back.label} className="mb-3" />
        )}

        {/* The title itself now lives only in the top bar (desktop) and
            MobileTopBar (mobile) — this is just the subtitle, shown at every
            size since there is no separate desktop header left to repeat it. */}
        {subtitle && <p className="mb-4 text-sm text-muted-foreground">{subtitle}</p>}

        {children}
      </div>
    </>
  );
}
