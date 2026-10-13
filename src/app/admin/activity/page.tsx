import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, Pill } from "@/components/ui/Primitives";
import { Pager, pageRange, parsePageParam } from "@/components/ui/Pager";
import type { AdminActivityLogEntry } from "@/lib/types/database";

export const metadata = { title: "Activity · Admin" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;

/**
 * The activity ledger.
 *
 * Readable by any admin, not only a superadmin, deliberately: an audit log
 * only the most privileged person can read is a log that cannot be used to
 * check the most privileged person. Mutual visibility is most of what makes it
 * work.
 *
 * It is append-only in the schema — there is no update or delete path from any
 * function, which assert_phase4_invariants enforces — so nothing here needs an
 * edit control, and there deliberately isn't one.
 */

/** Human labels for the verbs the code writes. Unknown verbs fall through to
 *  the raw string rather than being hidden: a new capability must be
 *  auditable the day it ships, not the day somebody remembers this map. */
const ACTION_LABELS: Record<string, string> = {
  "kyc.approve": "Approved verification",
  "kyc.reject": "Rejected verification",
  "withdrawal.complete": "Paid out a withdrawal",
  "withdrawal.reject": "Rejected a withdrawal",
  "withdrawal.confirm_verification": "Confirmed extra verification",
  "rate_markup.set": "Changed a rate markup",
  "setting.set": "Changed a setting",
  "user.suspend": "Suspended an account",
  "user.reinstate": "Reinstated an account",
  "user.view": "Opened an account's detail",
  "role.grant": "Granted admin access",
  "role.revoke": "Revoked admin access",
  "role.bootstrap": "Admin access from ADMIN_EMAILS",
  "mfa.enroll": "Set up two-factor",
  "mfa.unenroll": "Removed two-factor",
  "support.reply": "Replied to a support thread",
};

/** The verbs worth marking out at a glance: money, access, and the second
 *  factor coming off. */
const HIGH_IMPACT = new Set([
  "withdrawal.complete",
  "withdrawal.reject",
  "user.suspend",
  "role.grant",
  "role.revoke",
  "role.bootstrap",
  "mfa.unenroll",
  "setting.set",
]);

function detailText(detail: Record<string, unknown> | null): string | null {
  if (!detail) return null;
  const parts = Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function AdminActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  await requireAdminUser();
  const service = createAdminClient();

  const page = parsePageParam((await searchParams).page);
  const { from, to } = pageRange(page, PAGE_SIZE);

  // .range, and one row past the page, so "is there an older page" is answered
  // by this query rather than by a second count that can disagree with it. The
  // ledger had a bare .limit() and a line saying older entries exist somewhere
  // in the database — which is true, and useless to someone trying to read
  // them.
  //
  // created_at is not unique enough to page on alone: two actions logged in the
  // same millisecond can swap places between pages, which both skips and
  // duplicates rows. id breaks the tie.
  const { data, error } = await service
    .from("admin_activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) console.error("[admin/activity] read failed", error);
  const all = (data ?? []) as AdminActivityLogEntry[];
  const hasNext = all.length > PAGE_SIZE;
  const entries = all.slice(0, PAGE_SIZE);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-foreground">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every admin action, newest first. Append-only — entries can&apos;t be edited or removed
          by anyone, including from here.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
          {/* Page 2 of an empty result is a different fact from an empty
              ledger, and must not be reported as one. */}
          <p className="font-medium text-foreground">
            {page > 1 ? "Nothing further back than this" : "Nothing recorded yet"}
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            {page > 1
              ? "You've reached the start of the ledger."
              : "The ledger starts from the first admin action after this was switched on. It does not reconstruct history from before then — an audit log that invented its own past would be worth less than an empty one."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const detail = detailText(entry.detail);
            return (
              <li key={entry.id}>
                <Card className="space-y-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                    {HIGH_IMPACT.has(entry.action) && <Pill tone="pending">sensitive</Pill>}
                  </div>

                  <p className="font-mono text-xs text-muted-foreground">
                    {/* admin_email is denormalised at write time, so the entry
                        still names who did it after the account is gone. */}
                    {entry.admin_email ?? "(account removed)"}
                    {entry.target_type && entry.target_id
                      ? ` → ${entry.target_type} ${entry.target_id}`
                      : ""}
                  </p>

                  {detail && (
                    <p className="break-words text-sm text-muted-foreground">{detail}</p>
                  )}

                  <time
                    dateTime={entry.created_at}
                    className="block font-mono text-[0.6875rem] text-muted-foreground"
                  >
                    {new Date(entry.created_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </time>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Pager page={page} hasNext={hasNext} basePath="/admin/activity" />
    </div>
  );
}
