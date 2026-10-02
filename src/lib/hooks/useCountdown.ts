"use client";

import { useEffect, useState } from "react";

/**
 * Seconds remaining until an ISO timestamp, ticking once a second.
 *
 * The ticking clock is the state; the remaining seconds are DERIVED from it.
 * The obvious shape — storing `secondsLeft` and setting it from the effect —
 * writes state synchronously inside the effect body on every mount and every
 * `expiresAt` change, which triggers a cascading render each time. Keeping
 * `now` as the only state means the effect's only job is advancing the clock,
 * which is exactly what an effect is for.
 *
 * Returns 0 rather than a negative number once the deadline passes, so a
 * caller can treat 0 as "expired" without also guarding the sign.
 */
export function useCountdown(expiresAt: string | undefined): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // Runs unconditionally rather than only while a deadline exists. Gating it
    // would leave `now` frozen at mount time, so the first second after a
    // deadline appeared would be computed against a stale clock and show the
    // wrong figure.
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!expiresAt) return 0;
  return Math.max(Math.floor((new Date(expiresAt).getTime() - now) / 1000), 0);
}

export function formatCountdown(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
