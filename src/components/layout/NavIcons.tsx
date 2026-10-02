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
