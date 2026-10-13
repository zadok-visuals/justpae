"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

/**
 * "You have unsaved changes" — for the one form in this app where losing the
 * input is expensive: the KYC wizard, where a business submission is four
 * steps of typing plus three file uploads, and a mis-tapped bottom tab bar
 * throws all of it away silently.
 *
 * TWO MECHANISMS, because one is not enough and neither covers the other:
 *
 *   1. `beforeunload` for leaving the site — reload, close, typed URL, external
 *      link. The browser shows its own dialog here and will not let a page
 *      customise the wording, which is deliberate on the browser's part and
 *      fine: the only thing that matters is that it asks.
 *
 *   2. A capture-phase click listener for in-app navigation, which
 *      `beforeunload` never sees because the App Router never unloads the
 *      document. Every in-app destination in this product is a `<Link>`, i.e.
 *      a real anchor, so intercepting the click before React or the router see
 *      it covers the bottom tab bar, the sidebar and every inline link.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER: the browser Back button. The App
 * Router exposes no navigation event to hook and the only way to intercept a
 * popstate is to push a decoy history entry, which breaks the back button for
 * everyone who meant it and leaves the history stack wrong if the component
 * unmounts mid-flight. An honest gap is better than that trade.
 */
export function UnsavedChangesGuard({
  when,
  title = "Leave without saving?",
  body = "What you've filled in on this form will be lost. Nothing has been submitted yet.",
  confirmLabel = "Leave",
  cancelLabel = "Keep editing",
}: {
  /** True while there is something worth losing. */
  when: boolean;
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Read inside the listeners so they can be registered once rather than
  // re-registered on every keystroke that flips `when`. Mirrored in its own
  // effect because writing a ref during render is a lie about when the value
  // changed, and the lint rule is right to say so.
  const whenRef = useRef(when);
  useEffect(() => {
    whenRef.current = when;
  }, [when]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!whenRef.current) return;
      event.preventDefault();
    }

    function onClick(event: MouseEvent) {
      if (!whenRef.current) return;
      // Modified clicks open a new tab or window, so this page — and the form
      // on it — is not going anywhere.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      // Cross-origin is beforeunload's job, and a pure hash change on this
      // same page is not leaving at all.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setPendingHref(url.pathname + url.search + url.hash);
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    // Capture phase: the router's own click handler must not get there first.
    document.addEventListener("click", onClick, true);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return (
    <ConfirmDialog
      open={pendingHref !== null}
      title={title}
      body={body}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      destructive
      onCancel={() => setPendingHref(null)}
      onConfirm={() => {
        const href = pendingHref;
        setPendingHref(null);
        if (href) router.push(href);
      }}
    />
  );
}
