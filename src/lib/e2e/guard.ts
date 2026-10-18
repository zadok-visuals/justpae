/**
 * The switch that lets the end-to-end suite replace every payment provider
 * with a deterministic in-process mock — and the guard that makes it
 * impossible to ship that switch to a real deployment.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THE OBVIOUS GUARD DOES NOT WORK
 *
 * The instinct is `if (NODE_ENV === "production") refuse`. That is wrong here,
 * and quietly so: the suite is REQUIRED to run against a production build
 * (`next build && next start`), and both of those set NODE_ENV=production. A
 * NODE_ENV check would therefore refuse exactly the run it is meant to allow,
 * and anyone fixing that would be tempted to delete the guard rather than
 * narrow it.
 *
 * What actually separates "a production build on a laptop" from "a production
 * deployment" is WHERE it runs and WHAT HOSTNAME it serves:
 *
 *   1. VERCEL / VERCEL_ENV are set by the platform on every build and every
 *      runtime invocation, for preview deployments as well as production.
 *      Mock providers have no business on ANY hosted deployment — a preview
 *      with fake money is its own kind of disaster — so the presence of the
 *      variable at all is the refusal, not its value.
 *   2. APP_URL is the app's own public origin. If it is not a loopback host,
 *      this build is intended to be reachable by somebody who is not running
 *      the test suite.
 *
 * Either one is enough to refuse. Both are cheap to check and neither can be
 * satisfied accidentally by a developer running the suite locally.
 *
 * WHERE THIS IS ENFORCED, twice on purpose:
 *   - next.config.ts calls assertE2eProviderMocksAreSafe() at module scope, so
 *     a build with the flag set in a hosted environment FAILS THE BUILD rather
 *     than producing a deployable artefact. That is the requirement.
 *   - mockProviders.ts calls it again before serving a single mock response,
 *     so flipping the variable at runtime on an already-built deployment is
 *     refused too. A build-time-only guard would be bypassed by exactly that.
 *
 * This module imports NOTHING, so next.config.ts can pull it in without
 * dragging the app's module graph (and its own env assertions) into the
 * config load.
 */

/** The one variable. Deliberately not NEXT_PUBLIC_: the browser never needs it. */
export const E2E_PROVIDER_MOCK_ENV = "E2E_MOCK_PROVIDERS";

function asked(): boolean {
  const value = process.env[E2E_PROVIDER_MOCK_ENV];
  return value === "1" || value === "true";
}

function isLoopbackOrigin(raw: string): boolean {
  try {
    const { hostname } = new URL(raw);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    // An unparseable APP_URL is a misconfiguration, and the safe reading of a
    // misconfiguration in a guard is "not loopback".
    return false;
  }
}

/**
 * The reason the flag must be refused here, or null when it is safe to honour.
 * Returned rather than thrown so both callers can frame it their own way.
 */
export function e2eProviderMockRefusal(): string | null {
  if (!asked()) return null;

  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return (
      `${E2E_PROVIDER_MOCK_ENV} is set on a Vercel deployment ` +
      `(VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}). Mock payment providers must never ` +
      `reach a hosted environment, preview included. Remove the variable from the ` +
      `project's environment variables.`
    );
  }

  const appUrl = process.env.APP_URL;
  if (appUrl && !isLoopbackOrigin(appUrl)) {
    return (
      `${E2E_PROVIDER_MOCK_ENV} is set while APP_URL is "${appUrl}", which is not a ` +
      `loopback address. A build that other people can reach must talk to the real ` +
      `providers.`
    );
  }

  return null;
}

/** Throws with the refusal reason. Called at build time and before any mock response. */
export function assertE2eProviderMocksAreSafe(): void {
  const refusal = e2eProviderMockRefusal();
  if (refusal) throw new Error(`Refusing to enable provider mocks: ${refusal}`);
}

/**
 * Whether provider calls should be served from the mock. Safe by construction:
 * it is false unless the flag is set AND the guard above is satisfied.
 */
export function e2eProviderMocksEnabled(): boolean {
  return asked() && e2eProviderMockRefusal() === null;
}
