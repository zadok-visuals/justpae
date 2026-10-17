"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Card, Pill } from "@/components/ui/Primitives";
import { FieldError, TextField, TextAreaField } from "@/components/ui/Field";
import {
  searchUsers,
  suspendUser,
  reinstateUser,
  grantAdminRole,
  revokeAdminRole,
  type AdminUserSearchResult,
  type AdminUserActionState,
} from "@/lib/actions/adminUsers";

/**
 * Account administration: find an account, suspend it, reinstate it, and (for
 * a superadmin) hand out or take back admin access.
 *
 * SEARCH-FIRST, WITH NO DEFAULT LISTING. The page does not open with every
 * account's email on it. That list is an exfiltration surface for a single
 * compromised admin session and nobody doing real work needs it — you come
 * here about a specific person. Currently-suspended accounts ARE listed
 * without a search, because that is a list someone has to review.
 */
export function UserAdmin({
  isSuperadmin,
  suspended,
  currentAdminId,
}: {
  isSuperadmin: boolean;
  suspended: AdminUserSearchResult[];
  currentAdminId: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminUserSearchResult[] | null>(null);
  const [more, setMore] = useState(false);
  const [searching, startSearch] = useTransition();

  function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (term.length < 2) {
      toast.error("Type at least two characters.");
      return;
    }
    startSearch(async () => {
      const result = await searchUsers(term);
      setResults(result.users);
      setMore(result.more);
    });
  }

  return (
    <div className="space-y-6">
      <section>
        <form onSubmit={runSearch} className="flex items-end gap-2">
          <TextField
            name="q"
            label="Find an account"
            hint="Email or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="customer@example.com"
            className="flex-1"
          />
          <Button type="submit" size="md" fullWidth={false} loading={searching}>
            Search
          </Button>
        </form>

        {results !== null && (
          <div className="mt-4 space-y-2">
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts matched that.</p>
            ) : (
              results.map((user) => (
                <UserRow
                  key={user.id}
                  user={user}
                  isSuperadmin={isSuperadmin}
                  isSelf={user.id === currentAdminId}
                />
              ))
            )}

            {/* Said rather than silently truncated. The right answer to too
                many matches is a narrower term, not a Next button that walks
                the whole account table. */}
            {more && (
              <p className="pt-1 text-sm text-muted-foreground" aria-live="polite">
                More accounts matched than are shown here. Narrow it down — a full email address
                is the surest way.
              </p>
            )}
          </div>
        )}
      </section>

      {isSuperadmin && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Grant admin access
          </h2>
          <Card>
            <GrantForm />
          </Card>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Suspended accounts
        </h2>
        {suspended.length === 0 ? (
          <p className="text-sm text-muted-foreground">None.</p>
        ) : (
          <div className="space-y-2">
            {suspended.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                isSuperadmin={isSuperadmin}
                isSelf={user.id === currentAdminId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function GrantForm() {
  const [state, formAction] = useActionState<AdminUserActionState, FormData>(grantAdminRole, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) toast.success("Admin access granted.");
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      <TextField
        name="email"
        label="Their email"
        type="email"
        required
        autoComplete="off"
        placeholder="colleague@justpae.com"
        defaultValue={state.values?.email ?? ""}
      />
      <div>
        <label htmlFor="grant-role" className="mb-1.5 block text-sm font-medium text-foreground">
          Role
        </label>
        <select
          id="grant-role"
          name="role"
          defaultValue="admin"
          className="jp-field h-12 w-full rounded-lg border border-input bg-secondary px-3 text-sm text-foreground"
        >
          <option value="admin">admin — the queues, rates, support</option>
          <option value="superadmin">superadmin — also grants and revokes access</option>
        </select>
        {/* Stated here rather than discovered later: the grant is useless
            until they finish enrolment, and an admin who grants access and
            hears "it says set up an authenticator" will otherwise assume
            something broke. */}
        <p className="mt-1.5 text-xs text-muted-foreground">
          They&apos;ll be asked to set up an authenticator app the first time they open the admin
          tools. Until they do, they can&apos;t open any admin page.
        </p>
      </div>
      <SubmitButton pendingLabel="Granting…">Grant access</SubmitButton>
      <FieldError>{state.error}</FieldError>
    </form>
  );
}

function UserRow({
  user,
  isSuperadmin,
  isSelf,
}: {
  user: AdminUserSearchResult;
  isSuperadmin: boolean;
  isSelf: boolean;
}) {
  const [mode, setMode] = useState<"idle" | "suspending">("idle");

  const [suspendState, suspendAction] = useActionState<AdminUserActionState, FormData>(
    suspendUser,
    {},
  );
  const [reinstateState, reinstateAction] = useActionState<AdminUserActionState, FormData>(
    reinstateUser,
    {},
  );
  const [revokeState, revokeAction] = useActionState<AdminUserActionState, FormData>(
    revokeAdminRole,
    {},
  );

  useEffect(() => {
    for (const s of [suspendState, reinstateState, revokeState]) {
      if (s.error) toast.error(s.error);
    }
    if (suspendState.ok) toast.success("Account suspended.");
    if (reinstateState.ok) toast.success("Account reinstated.");
    if (revokeState.ok) toast.success("Admin access revoked.");
  }, [suspendState, reinstateState, revokeState]);

  // Derived, not reset in the effect above: the reason form is open while the
  // admin asked for it AND the suspension has not yet gone through. A
  // setMode("idle") in the effect would be the same thing one paint later,
  // which is one paint of a form sitting under a row that already says
  // "suspended".
  const suspendFormOpen = mode === "suspending" && !suspendState.ok;

  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="min-w-0 font-medium text-foreground">
          {user.fullName || user.email}
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {user.adminRole && <Pill tone="pending">{user.adminRole}</Pill>}
          {user.suspendedAt && <Pill tone="failed">suspended</Pill>}
          <Pill tone={user.kycStatus === "approved" ? "success" : "neutral"}>
            {user.kycStatus.replace("_", " ")}
          </Pill>
        </div>
      </div>

      <p className="truncate font-mono text-xs text-muted-foreground">
        {user.email}
        {user.country ? ` · ${user.country}` : ""} · joined{" "}
        {new Date(user.createdAt).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>

      {user.suspendedAt && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-foreground">
          {user.suspendedReason || "No reason recorded."}
        </p>
      )}

      {/* An admin acting on their own row is how someone locks themselves out
          of the tool they would need to undo it. Both server functions refuse
          it; the controls are simply absent so nobody tries. */}
      {isSelf ? (
        <p className="text-xs text-muted-foreground">This is your own account.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {user.suspendedAt ? (
            <form action={reinstateAction}>
              <input type="hidden" name="userId" value={user.id} />
              <SubmitButton
                variant="secondary"
                size="sm"
                fullWidth={false}
                pendingLabel="Reinstating…"
              >
                Reinstate
              </SubmitButton>
            </form>
          ) : !suspendFormOpen ? (
            <Button
              variant="danger"
              size="sm"
              fullWidth={false}
              onClick={() => setMode("suspending")}
            >
              Suspend
            </Button>
          ) : null}

          {isSuperadmin && user.adminRole && (
            <form action={revokeAction}>
              <input type="hidden" name="userId" value={user.id} />
              <SubmitButton
                variant="secondary"
                size="sm"
                fullWidth={false}
                pendingLabel="Revoking…"
              >
                Revoke admin
              </SubmitButton>
            </form>
          )}
        </div>
      )}

      {suspendFormOpen && (
        <form action={suspendAction} className="space-y-2 border-t border-border pt-3">
          <input type="hidden" name="userId" value={user.id} />
          <TextAreaField
            name="reason"
            label="Why are you suspending this account?"
            hint="The customer sees this"
            required
            placeholder="e.g. Unusual activity under review. We'll be in touch within 48 hours."
            defaultValue={suspendState.values?.reason ?? ""}
          />
          <div className="flex gap-2">
            <SubmitButton variant="danger" size="sm" fullWidth={false} pendingLabel="Suspending…">
              Suspend account
            </SubmitButton>
            <button
              type="button"
              onClick={() => setMode("idle")}
              className="min-h-11 px-3 text-sm font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
          <FieldError>{suspendState.error}</FieldError>
        </form>
      )}
    </Card>
  );
}
