"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";

/**
 * Lets the shared desktop TopBar (rendered by the layout, which never sees
 * page content) show the title each PAGE already passes to PageShell — "Hello,
 * {name}" on Home, "Transactions" on /transactions, and so on — without
 * threading it through every layout in between.
 *
 * useLayoutEffect, not useEffect: it fires before the browser paints, so the
 * bar shows the right title on first render instead of flashing blank for a
 * frame while the page underneath mounts.
 */

const PageTitleContext = createContext<{
  title: string;
  setTitle: (title: string) => void;
} | null>(null);

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("");
  // Memoized so the provided object's identity is stable across renders that
  // don't actually change the title — PageTitlePublisher's effect depends on
  // the stable setTitle below regardless, but this keeps every OTHER consumer
  // (just TopBar, today) from re-rendering on an unrelated provider render.
  const ctx = useMemo(() => ({ title, setTitle }), [title]);
  return <PageTitleContext.Provider value={ctx}>{children}</PageTitleContext.Provider>;
}

/** Rendered by PageShell so it publishes its title without becoming a client
 *  component itself — the hook call lives in this one small leaf instead. */
export function PageTitlePublisher({ title }: { title: string }) {
  // setTitle, not the whole context object, in the dependency array: setTitle
  // is useState's own setter and never changes identity, while the context
  // object is recreated whenever the title itself does. Depending on the
  // object instead loops forever — the effect fires, calls setTitle, the
  // provider re-renders with a new context object, which re-triggers the
  // effect, which calls setTitle again.
  const setTitle = useContext(PageTitleContext)?.setTitle;
  useLayoutEffect(() => {
    setTitle?.(title);
    // Clearing on unmount would blank the bar during the exit of one page and
    // the mount of the next — worse than briefly showing the outgoing title.
  }, [setTitle, title]);
  return null;
}

export function useCurrentPageTitle(): string {
  return useContext(PageTitleContext)?.title ?? "";
}
