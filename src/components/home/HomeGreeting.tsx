import Link from "next/link";

/**
 * Home's own mobile header: who you are on the left, the two things that can
 * be waiting for you on the right (the support icon and the bell are added
 * by MobileTopBar around this).
 *
 * The avatar is a link to Profile rather than decoration — it is the control
 * people reach for in every other banking app, and it was previously the one
 * destination on the tab bar with no shortcut from the screen you land on.
 */
export function HomeGreeting({
  initials,
  firstName,
}: {
  initials: string;
  firstName: string | null;
}) {
  return (
    <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary"
      >
        {initials}
      </span>
      <span className="min-w-0 truncate text-base font-semibold text-foreground">
        {firstName ? `Hello, ${firstName}` : "Hello"}
      </span>
    </Link>
  );
}
