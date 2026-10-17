/**
 * The standing catalog check, runnable against the LINKED project.
 *
 *   node --env-file=.env.local scripts/catalog-check.mjs
 *
 * WHY THIS EXISTS, given supabase/tests already exists
 *
 * `supabase test db` needs Docker, and `psql "$DATABASE_URL" -f ...` needs a
 * Postgres client. Neither is present on every machine this repo gets worked
 * on, and "the security assertions did not run because a container runtime was
 * missing" is the failure mode that lets a grant regression ship.
 *
 * So this runs the assertions the migrations themselves define — the ones that
 * interrogate the live catalog rather than trusting a diff — over PostgREST,
 * with the service role. It needs nothing but Node and the env file.
 *
 * It is NOT a replacement for the pgTAP suite. pgTAP proves behaviour by
 * becoming `authenticated` and attempting the attack; this proves PRIVILEGE by
 * reading pg_proc. Run both where you can. Where you can only run one, this is
 * the one that catches a widened grant, which is what every Phase 1 bug was
 * made of.
 *
 * A clean run prints PASS for each assertion. Any failure prints the offending
 * function names and exits non-zero.
 *
 * Output goes to stderr rather than stdout, matching scripts/build-emails.ts:
 * the repo's no-console rule allows error and warn precisely so that script
 * output is a deliberate choice rather than a stray debug line.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Run with: node --env-file=.env.local scripts/catalog-check.mjs",
  );
  process.exit(1);
}

/**
 * Every assertion function the migrations define. Add to this list in the same
 * migration that adds a new one — an assertion nobody calls is a comment.
 */
const ASSERTIONS = [
  "assert_phase1_invariants",
  "assert_phase3_invariants",
  "assert_phase4_invariants",
];

const db = createClient(url, key, { auth: { persistSession: false } });

let failed = false;

for (const fn of ASSERTIONS) {
  const { data, error } = await db.rpc(fn);
  if (error) {
    console.error(`FAIL  ${fn}`);
    console.error(`      ${error.message}`);
    failed = true;
  } else {
    console.error(`PASS  ${fn} -> ${JSON.stringify(data)}`);
  }
}

if (failed) {
  console.error("\nCatalog check FAILED. The message above names the regression.");
  process.exit(1);
}

console.error("\nCatalog check passed.");
