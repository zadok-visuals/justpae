import { PageShell } from "@/components/layout/PageShell";
import { Card, Banner, DetailRow } from "@/components/ui/Primitives";
import { CopyField } from "@/components/ui/CopyButton";
import { ShareLink } from "@/components/receive/ShareLink";
import { getReceivingDetails } from "@/lib/actions/receive";

export const metadata = { title: "Receive dollars" };
export const dynamic = "force-dynamic";

/**
 * FEATURE 1 — /receive.
 *
 * Shows the user's USD receiving details with copy buttons, a shareable link
 * and a QR code.
 *
 * The provider that will issue these is not confirmed, so the flag ships OFF
 * and this page renders an honest coming-soon state. It does NOT render
 * placeholder account numbers: a fake account number on a page headed "send
 * dollars here" is the one failure mode that loses somebody real money.
 */
export default async function ReceivePage() {
  const state = await getReceivingDetails();

  return (
    <PageShell
      title="Receive dollars"
      subtitle="Share these details with anyone sending you dollars."
      back={{ href: "/home", label: "Home" }}
    >
      {state.status === "unavailable" && (
        <div className="space-y-4">
          <Banner tone="info" title="Almost ready">
            {state.reason}
          </Banner>

          <Card>
            <h2 className="text-sm font-semibold text-foreground">What you&apos;ll get</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An account number and routing number in your name, plus a reference code. Anyone
              can send dollars to it from their bank, and the money lands in your justpae dollar
              wallet.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              In the meantime you can deposit naira, shillings or USDT and convert to dollars.
            </p>
          </Card>
        </div>
      )}

      {state.status === "error" && (
        <Banner tone="danger" title="We couldn't load your details">
          {state.error}
        </Banner>
      )}

      {state.status === "ready" && (
        <div className="space-y-4">
          {state.details.status !== "active" && (
            <Banner tone="warning" title="Your details are being activated">
              You can see them now, but hold off on sending anything until this clears.
            </Banner>
          )}

          {/* The reference code comes FIRST and is emphasised. It is the one
              field that always exists, and a transfer that arrives without it
              cannot be attributed to the right person. */}
          <CopyField label="Reference code — always include this" value={state.details.referenceCode} emphasis />

          <Card>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Account details
            </h2>
            <div>
              {state.details.accountName && (
                <DetailRow label="Account name">{state.details.accountName}</DetailRow>
              )}
              {state.details.accountNumber && (
                <DetailRow label="Account number" mono>
                  {state.details.accountNumber}
                </DetailRow>
              )}
              {state.details.routingNumber && (
                <DetailRow label="Routing number" mono>
                  {state.details.routingNumber}
                </DetailRow>
              )}
              {state.details.accountType && (
                <DetailRow label="Account type">{state.details.accountType}</DetailRow>
              )}
              {state.details.bankName && (
                <DetailRow label="Bank">{state.details.bankName}</DetailRow>
              )}
              {state.details.bankAddress && (
                <DetailRow label="Bank address">{state.details.bankAddress}</DetailRow>
              )}
            </div>
          </Card>

          <div className="space-y-2">
            {state.details.accountNumber && (
              <CopyField label="Account number" value={state.details.accountNumber} />
            )}
            {state.details.routingNumber && (
              <CopyField label="Routing number" value={state.details.routingNumber} />
            )}
          </div>

          <Card>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Share
            </h2>
            <ShareLink
              url={`${process.env.APP_URL ?? ""}/pay/${state.details.referenceCode}`}
              referenceCode={state.details.referenceCode}
            />
          </Card>
        </div>
      )}
    </PageShell>
  );
}
