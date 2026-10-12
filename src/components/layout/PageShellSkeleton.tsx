import { MobileTopBar } from "@/components/layout/DashboardChrome";
import { PageTitlePublisher } from "@/components/layout/PageTitleContext";
import { Skeleton } from "@/components/ui/Primitives";

/**
 * The loading twin of PageShell.
 *
 * It reproduces the shell exactly — same top bar, same column width, same
 * spacing — so the only thing that changes when the page resolves is the
 * body. The title is published to the shared desktop TopBar and shown in
 * MobileTopBar immediately, the same as PageShell itself: it is known before
 * the data is, so showing it right away tells the reader they landed where
 * they meant to, and it means there is nothing left in this component to
 * desync from PageShell if that one changes again.
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
      <PageTitlePublisher title={title} />
      <MobileTopBar title={title} />

      <div
        className={`mx-auto w-full px-4 py-5 sm:px-6 sm:py-8 ${wide ? "max-w-4xl" : "max-w-2xl"}`}
      >
        {subtitle && <Skeleton className="mb-4 h-4 w-48" />}

        {children}
      </div>
    </>
  );
}
