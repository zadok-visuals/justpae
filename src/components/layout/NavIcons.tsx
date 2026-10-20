/**
 * Inline SVG icons.
 *
 * Inline rather than an icon package: the whole set is a handful of paths, and
 * a dependency for them would ship a few hundred kilobytes to render five tab
 * icons. `currentColor` everywhere so a single text colour drives the active
 * and inactive states.
 */

type IconProps = { className?: string };

function Icon({ children, className = "size-6" }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </Icon>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
    </Icon>
  );
}

export function ConvertIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </Icon>
  );
}

export function BillsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
    </Icon>
  );
}

export function ProfileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </Icon>
  );
}

export function ReceiveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4 19h16" />
    </Icon>
  );
}

/**
 * Accounts — a stack of cards, one per wallet. Deliberately not a wallet or a
 * bank: a wallet already means "balance" on Home's cards, and a bank building
 * means somewhere money goes OUT to, which is Withdraw.
 */
export function AccountsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M6 8V6a2 2 0 0 1 2-2h11" />
      <path d="M16.5 14h.5" />
    </Icon>
  );
}

export function DepositIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 11h18" />
      <path d="M7 4h10" />
    </Icon>
  );
}

export function WithdrawIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 20V9" />
      <path d="M7.5 13.5 12 9l4.5 4.5" />
      <path d="M4 5h16" />
    </Icon>
  );
}

export function AirtimeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </Icon>
  );
}

export function AdminIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3l7 3.5v5c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9v-5L12 3Z" />
      <path d="m9.5 12 1.8 1.8L15 10" />
    </Icon>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M18 8.5a6 6 0 1 0-12 0c0 4.5-2 5.5-2 5.5h16s-2-1-2-5.5" />
      <path d="M10.3 18a2 2 0 0 0 3.4 0" />
    </Icon>
  );
}

export function SupportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 12a8 8 0 1 0-3.2 6.4L21 20l-1.1-3.4A7.9 7.9 0 0 0 20 12Z" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.7.4-1.2 1-1.2 1.8" />
      <path d="M12 16.2h.01" />
    </Icon>
  );
}

/** The support composer's attach control. */
export function PaperclipIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.4 11.6l-7.9 7.9a5 5 0 0 1-7.1-7.1l8.5-8.5a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-2.8-2.8l7.8-7.8" />
    </Icon>
  );
}

/**
 * Flights (Group 4e). An aeroplane in plan view rather than the tilted
 * paper-plane shape, which is already SendIcon's — two nav items one above
 * the other with near-identical glyphs is a worse problem than a slightly
 * duller icon.
 */
export function FlightsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M10.5 3.2a1.5 1.5 0 0 1 3 0V9l7.5 4.3v2.2l-7.5-2.3v4.3l2.6 1.9v1.8L12 20.4l-4.1 1.8v-1.8l2.6-1.9v-4.3L3 16.5v-2.2L10.5 9V3.2Z" />
    </Icon>
  );
}

/** The support composer's submit control. */
export function SendIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.5 12L20 4l-5 16-4.2-6.3L4.5 12Z" />
      <path d="M10.8 13.7L20 4" />
    </Icon>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  );
}

/** The mobile "More actions" tile. Filled dots, not stroked — at 24px a
 *  stroked circle this small reads as a faint ring rather than a dot. */
export function MoreIcon({ className = "size-6" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}
