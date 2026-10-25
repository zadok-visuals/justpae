import { MobileTopBar } from "@/components/layout/DashboardChrome";
import { PageTitlePublisher } from "@/components/layout/PageTitleContext";
import { BackButton } from "@/components/ui/BackButton";

/**
 * The content column every dashboard page sits in.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * GROUP 6a — THREE WIDTHS, BECAUSE max-w-2xl WAS ANSWERING TWO QUESTIONS AT ONCE
 *
 * The original note here was right about one thing and wrong about another,
 * and the two were tangled together: "a money form read at 1440px should not
 * stretch a label to one edge and its value to the other". True, and it is
 * why the FORM is still capped — a `<DetailRow>` with "Deposit fee" at x=0
 * and "−₦100" at x=1400 is not a row anyone can read as a pair.
 *
 * But it then applied that cap to the whole PAGE, which is a different thing.
 * /home at 1440px put five wallet cards, four quick actions, a rate strip and
 * an activity list into a 42rem ribbon down the middle with roughly 600px of
 * empty background either side, and the fix is not to stretch any of those
 * elements — it is to stop stacking content that does not need to be stacked.
 *
 *   form    max-w-2xl (42rem). One readable column. Every form page, and the
 *           default, so nothing changes for a page that did not ask.
 *   wide    max-w-4xl (56rem). Tables and lists, as before.
 *   split   max-w-[1200px] with an `aside`. Two columns from `lg` (1024px)
 *           up, one below it.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY `lg` AND NOT `sm`, AND WHY 1200px
 *
 * The sidebar is 15rem (240px) and appears at `sm` (640px). A two-column
 * content area inside the 400px that leaves would give two columns of 200px,
 * which is worse than one column of 400px. 1024px is the first breakpoint
 * where the content area is wide enough (≈780px) for a 1fr + 22rem split to
 * leave both columns readable.
 *
 * 1200px is the cap because of line length, not because of taste: the reading
 * column in a split is ~46rem at that width, which is at the top of the
 * comfortable range for body text. Letting it grow to 1920px would produce
 * exactly the "stretched lines" the brief asks to avoid — the opposite
 * failure from the one being fixed, and just as easy to ship.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE ASIDE IS A SECOND COLUMN, NOT A SIDEBAR
 *
 * It holds secondary, reference content — rates, recent activity, a summary
 * of what is about to happen. On mobile it renders AFTER the children, in the
 * same single column, which is the whole reason this is a slot rather than
 * two hand-written grids per page: the stacking order on a phone is then a
 * property of the shell rather than something each page gets right or wrong.
 *
 * `lg:sticky` on the aside, so on a tall page the reference column stays put
 * while the primary column scrolls. `lg:items-start` on the grid is what
 * makes that work — without it the grid stretches both children to equal
 * height and `sticky` has nothing to stick within.
 */
export type PageWidth = "form" | "wide" | "split";

const WIDTHS: Record<PageWidth, string> = {
  form: "max-w-2xl",
  wide: "max-w-4xl",
  split: "max-w-[1200px]",
};

export function PageShell({
  title,
  subtitle,
  back,
  children,
  aside,
  width,
  mobileLeading,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  /** Replaces the mobile bar's title — Home's avatar and greeting. */
  mobileLeading?: React.ReactNode;
  /**
   * GROUP 5b. `href` is the FALLBACK destination, not the destination: Back
   * walks the session's own history when the previous entry is a page of
   * ours, and uses this only when there is none (a deep link, a cold load, a
   * push notification). Shown at every viewport size now, not just mobile.
   */
  back?: { href: string; label: string };
  children: React.ReactNode;
  /**
   * GROUP 6a. The second column, from `lg` up; stacked underneath `children`
   * below that. Passing it implies `width="split"` unless `width` says
   * otherwise, because a two-column layout in a 42rem column is not one.
   */
  aside?: React.ReactNode;
  /** Explicit width. Overrides the `aside` implication and `wide`. */
  width?: PageWidth;
  /**
   * Kept for the pages that already pass it (the activity list, admin
   * tables). `width="wide"` is the same thing said once; this is the older
   * spelling and not worth a churn commit across every caller.
   */
  wide?: boolean;
}) {
  const resolved: PageWidth = width ?? (aside ? "split" : wide ? "wide" : "form");

  return (
    <>
      {/* Publishes to the desktop TopBar; renders nothing itself. On mobile
          the title still comes from MobileTopBar below, not this. */}
      <PageTitlePublisher title={title} />
      <MobileTopBar title={title} leading={mobileLeading} />

      <div className={`mx-auto w-full px-4 py-5 sm:px-6 sm:py-8 ${WIDTHS[resolved]}`}>
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

        {aside ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
            <div className="min-w-0">{children}</div>
            {/* `top-6` clears the desktop TopBar, which is the only thing
                above this that is itself fixed. */}
            <aside className="min-w-0 space-y-6 lg:sticky lg:top-6">{aside}</aside>
          </div>
        ) : (
          children
        )}
      </div>
    </>
  );
}
