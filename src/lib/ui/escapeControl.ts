/**
 * GROUP 5c — how every "get me out of here" control looks.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHAT THESE CONTROLS HAVE IN COMMON
 *
 * Back, "Later" in onboarding, "Back to app" in admin, "Back to justpae" on
 * the legal pages. Four controls, written four times, all of them muted grey
 * text — `text-muted-foreground`, the same colour as the body copy they sat
 * next to — in a product whose entire accent vocabulary is one gold. The
 * result is a control that is technically present and visually absent, in the
 * corner people look at when they want to leave, which is the worst possible
 * place to make somebody hunt.
 *
 * None of them had a hover state worth the name, and none had a pressed
 * state at all. On a phone that matters more than the colour: a tap with no
 * acknowledgement, followed by a navigation that takes a moment, reads as a
 * tap that did not register — so the user taps again, and the second tap
 * lands on whatever the new page put there.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A STRING IN lib/ AND NOT A COMPONENT
 *
 * Two of the four genuinely cannot be the BackButton component. "Later" and
 * "Back to app" have ONE fixed destination, so they must stay `<a href>`:
 * middle-clicking them, long-pressing for "open in new tab" and hovering to
 * read the status bar all have to work, and a `<button>` that navigates
 * breaks all three. Back cannot be an `<a>` for the mirror-image reason — its
 * destination is not known until the click.
 *
 * So the BEHAVIOUR legitimately differs and only the LOOK is shared, which is
 * what a class string is for. It lives here rather than in BackButton.tsx
 * because that file is `"use client"`, and the two layouts that need this are
 * Server Components — importing a plain value across a client boundary is
 * exactly the kind of thing that works until it does not.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * THE THREE STATES, EXPLICITLY
 *
 *   hover   the gold brightens to gold-light and a sidebar-tinted ground
 *           appears, so the hit area becomes visible rather than merely the
 *           text changing shade
 *   active  scale-95 plus the same ground — the acknowledgement described
 *           above, on the frame of the tap rather than after the navigation
 *   focus   deliberately NOT specified here. globals.css already draws a 2px
 *           gold outline on `button:focus-visible, a:focus-visible`, and the
 *           rule that document sets out — ONE focus indicator, never two
 *           stacked — is worth more than a bespoke ring on this control.
 *
 * `min-h-11` is 44px. `-mx-2` with `px-2` grows the hit area outward without
 * moving the text, so the target reaches full size without the layout shifting
 * around it.
 */
export const BACK_BUTTON_CLASS =
  "inline-flex min-h-11 items-center gap-1.5 rounded-lg -mx-2 px-2 text-sm font-medium " +
  "text-primary transition-colors hover:bg-sidebar-accent hover:text-gold-light " +
  "active:scale-95 active:bg-sidebar-accent";

/**
 * The round 44px icon buttons in both top bars — support and notifications.
 *
 * Same problem, different shape: `text-muted-foreground` with a hover that
 * only changed the background. They are the two controls a user reaches for
 * when something has gone wrong, so they get the accent colour too, and a
 * pressed state for the same reason the text controls do.
 */
export const HEADER_ICON_BUTTON_CLASS =
  "relative flex size-11 items-center justify-center rounded-full text-primary " +
  "transition-colors hover:bg-sidebar-accent hover:text-gold-light " +
  "active:scale-95 active:bg-sidebar-accent";
