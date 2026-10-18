import Link from "next/link";
import type { AccountAction } from "@/lib/accounts/actions";

/**
 * The things you can do with one wallet, with the unavailable ones still
 * visible and still explained.
 *
 * A DISABLED ACTION IS NOT A HIDDEN ACTION. Dropping "Add money" off the cedi
 * page would leave a Ghanaian user with no way to tell whether the product
 * cannot do it, has not built it, or has hidden it from them specifically.
 * The tile stays, greyed, with one line saying why — which is also the only
 * way they find out it is temporary.
 *
 * The reason is rendered as text in the tile rather than as a `title`
 * attribute or a tooltip: a tooltip does not exist on a touchscreen, and this
 * is a product whose users are overwhelmingly on one.
 */
export function AccountActions({ actions }: { actions: AccountAction[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {actions.map((action) => (
        <li key={action.key}>
          {action.disabledReason ? (
            <div
              // Not a link and not a button — there is nothing to press. A
              // disabled <button> would still be announced as a button a
              // screen-reader user then wonders how to activate.
              aria-disabled="true"
              className="flex h-full min-h-16 flex-col justify-center gap-0.5 rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-3"
            >
              <span className="text-sm font-medium text-muted-foreground">{action.label}</span>
              <span className="text-xs text-muted-foreground">{action.disabledReason}</span>
            </div>
          ) : (
            <Link
              href={action.href}
              className="flex h-full min-h-16 flex-col justify-center gap-0.5 rounded-xl border border-border bg-card px-4 py-3"
            >
              <span className="text-sm font-medium text-foreground">{action.label}</span>
              {action.note ? (
                <span className="text-xs text-muted-foreground">{action.note}</span>
              ) : (
                <span className="text-xs text-primary">Continue →</span>
              )}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
