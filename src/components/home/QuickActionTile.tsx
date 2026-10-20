import Link from "next/link";
import type { AriaAttributes, ReactElement } from "react";

/**
 * GROUP 3b — the one tile every quick action uses, Deposit's menu trigger
 * included.
 *
 * WHAT THIS REPLACED. AddMoneyMenu built its own trigger button with its own
 * classes, close to but not quite the Link tiles' — no `h-full`, no explicit
 * min-height. A `<Link>` tile IS a grid item, so grid's default
 * `align-items: stretch` fills it to the row's height for free; the menu's
 * trigger sat inside an extra wrapper div (needed for the popover's
 * `relative` anchor), so the STRETCH applied to that wrapper and stopped
 * there — the button inside sized to its own content, shorter than its
 * neighbours at any width where the row has slack to stretch into.
 *
 * One component, one set of classes, used by every tile including the
 * trigger, closes that gap by construction instead of by matching numbers
 * across two files by hand.
 */

const TILE_CLASS =
  "relative flex h-full min-h-[5.5rem] w-full min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-center text-xs font-medium text-foreground sm:min-w-0";

function TileContent({
  label,
  Icon,
  maintenance,
}: {
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
  maintenance?: boolean;
}) {
  return (
    <>
      <span className={maintenance ? "text-muted-foreground" : "text-primary"}>
        <Icon className="size-6" />
      </span>
      {/* Balanced wrapping over two lines rather than three — a tile this
          narrow runs out of width on "Pay to China" at a plain center-align. */}
      <span className="line-clamp-2 leading-tight text-balance">{label}</span>
      {/* A dot, not the full badge: these tiles are 72px wide on a phone and
          the word "Maintenance" does not fit in one. The accessible name
          carries the actual word, so nothing is conveyed by colour alone. */}
      {maintenance && (
        <>
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 size-2 rounded-full bg-muted-foreground"
          />
          <span className="sr-only">— under maintenance</span>
        </>
      )}
    </>
  );
}

interface QuickActionTileProps {
  label: string;
  Icon: (props: { className?: string }) => ReactElement;
  maintenance?: boolean;
  className?: string;
}

export function QuickActionLink({
  href,
  label,
  Icon,
  maintenance,
  className = "",
}: QuickActionTileProps & { href: string }) {
  return (
    <Link href={href} className={`${TILE_CLASS} ${className}`}>
      <TileContent label={label} Icon={Icon} maintenance={maintenance} />
    </Link>
  );
}

export function QuickActionButton({
  onClick,
  label,
  Icon,
  maintenance,
  className = "",
  buttonRef,
  ...aria
}: QuickActionTileProps &
  AriaAttributes & {
    onClick: () => void;
    buttonRef?: React.Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={`${TILE_CLASS} ${className}`}
      {...aria}
    >
      <TileContent label={label} Icon={Icon} maintenance={maintenance} />
    </button>
  );
}

/** The wrapper every tile sits in on the rail/grid — h-full so the stretch above reaches it. */
export const QUICK_ACTION_WRAPPER_CLASS = "h-full min-w-[4.5rem] shrink-0 sm:min-w-0";
