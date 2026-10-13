"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Primitives";
import { sendTestEmail } from "@/lib/actions/admin";

/**
 * "Is email actually working?" — answerable without moving real money.
 *
 * Every send in this codebase swallows its own failure on purpose: an email
 * provider being down must never fail a withdrawal that has already left. The
 * cost of that correct decision is that a misconfigured sending domain is
 * completely silent until a customer says they never received anything.
 *
 * It sends to the signed-in admin's own address, which is deliberate and not a
 * missing feature — a box to type a recipient into would make this an open
 * relay carrying our domain's reputation.
 */
export function TestEmailButton() {
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [pending, startSending] = useTransition();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-semibold text-foreground">Check email delivery</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sends one test email to your own admin address. No customer is emailed and nothing about
          any account changes.
        </p>
      </div>

      <Button
        type="button"
        size="md"
        variant="secondary"
        loading={pending}
        onClick={() => startSending(async () => setResult(await sendTestEmail()))}
      >
        Send test email
      </Button>

      {result?.ok && (
        <Banner tone="success" title="Sent">
          Check your inbox. If it isn&apos;t there in a minute, check spam — that itself tells you
          something about the sending domain.
        </Banner>
      )}

      {result?.error && (
        <Banner tone="danger" title="Not sent">
          {result.error}
        </Banner>
      )}
    </div>
  );
}
