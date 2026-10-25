import Link from "next/link";
import { ConvertIcon, DepositIcon, SendIcon, WithdrawIcon } from "@/components/layout/NavIcons";

/**
 * The four things this product is for, directly under the balance.
 *
 * Fixed at four, in a four-column grid, so they are all on screen at 360px
 * and never scroll. The circles are a fixed 3.5rem whatever the label does;
 * the label wraps under them rather than widening the cell, which is what
 * keeps every circle the same size in the row.
 */
const ACTIONS = [
  { href: "/deposit", label: "Deposit", Icon: DepositIcon },
  { href: "/withdraw", label: "Withdraw", Icon: WithdrawIcon },
  { href: "/convert", label: "Convert", Icon: ConvertIcon },
  { href: "/pay-to-china", label: "Pay to China", Icon: SendIcon },
];

export function MajorActions() {
  return (
    <nav aria-label="Money actions">
      <ul className="grid grid-cols-4 gap-1">
        {ACTIONS.map(({ href, label, Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex flex-col items-center gap-1.5 rounded-xl p-1 transition-colors hover:bg-accent active:bg-accent"
            >
              <span
                aria-hidden="true"
                className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary"
              >
                <Icon className="size-6" />
              </span>
              <span className="line-clamp-2 text-center text-xs font-medium leading-tight text-foreground">
                {label}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
