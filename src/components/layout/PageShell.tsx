import Link from "next/link";
import { MobileTopBar } from "@/components/layout/DashboardChrome";

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

        <header className="mb-5 hidden sm:block">
          <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </header>

        {/* On mobile the title lives in the top bar, so only the subtitle
            repeats here — showing both would print the same words twice. */}
        {subtitle && <p className="mb-4 text-sm text-muted-foreground sm:hidden">{subtitle}</p>}

        {children}
      </div>
    </>
  );
}
