import Link from "next/link";
import {
  ReceiveIcon,
  ConvertIcon,
  WithdrawIcon,
  BillsIcon,
  AirtimeIcon,
} from "@/components/layout/NavIcons";

/**
 * The five things people come here to do, one tap from Home.
 *
 * Airtime is listed separately from Bills even though it is a bill category,
 * because topping up a phone is by far the most frequent single action in this
 * market and burying it one level inside "Bills" makes the common case slower
 * than the rare ones.
 *
 * Scrolls horizontally on a narrow phone rather than wrapping to a second row
 * or shrinking the targets below a comfortable tap size.
 */
const ACTIONS = [
  { href: "/receive", label: "Receive", Icon: ReceiveIcon },
  { href: "/convert", label: "Convert", Icon: ConvertIcon },
  { href: "/withdraw", label: "Withdraw", Icon: WithdrawIcon },
  { href: "/bills", label: "Bills", Icon: BillsIcon },
  { href: "/bills/airtime", label: "Airtime", Icon: AirtimeIcon },
];

export function QuickActions() {
  return (
    <div className="snap-rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
      {ACTIONS.map(({ href, label, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-3 text-xs font-medium text-foreground sm:min-w-0"
        >
          <span className="text-primary">
            <Icon className="size-6" />
          </span>
          {label}
        </Link>
      ))}
    </div>
  );
}
