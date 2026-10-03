import Link from "next/link";
import { MobileTopBar } from "@/components/layout/DashboardChrome";
import { PageTitlePublisher } from "@/components/layout/PageTitleContext";

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
  /** Shown on mobile where there is no sidebar to navigate back through. */
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
        {back && (
          <Link
            href={back.href}
            className="mb-3 inline-flex min-h-11 items-center text-sm font-medium text-muted-foreground sm:hidden"
          >
            ← {back.label}
          </Link>
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
