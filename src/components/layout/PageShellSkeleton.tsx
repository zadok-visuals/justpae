import { MobileTopBar } from "@/components/layout/DashboardChrome";
import { Skeleton } from "@/components/ui/Primitives";

/**
 * The loading twin of PageShell.
 *
 * It reproduces the shell exactly — same top bar, same column width, same
 * header spacing — so the only thing that changes when the page resolves is
 * the body. The title is real text rather than a shimmer block: it is known
 * before the data is, and showing it immediately tells the reader they landed
 * where they meant to.
 */
export function PageShellSkeleton({
  title,
  children,
  wide = false,
  subtitle = true,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  /** Reserve a line for the page subtitle, when the real page has one. */
  subtitle?: boolean;
}) {
  return (
    <>
      <MobileTopBar title={title} />

      <div
        className={`mx-auto w-full px-4 py-5 sm:px-6 sm:py-8 ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      >
        <header className="mb-5 hidden sm:block">
          <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
          {subtitle && <Skeleton className="mt-2 h-4 w-64" />}
        </header>

        {subtitle && <Skeleton className="mb-4 h-4 w-48 sm:hidden" />}

        {children}
      </div>
    </>
  );
}
