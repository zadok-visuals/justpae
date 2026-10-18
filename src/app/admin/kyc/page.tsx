import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState, Pill, DetailRow } from "@/components/ui/Primitives";
import { KycQueueActions } from "@/components/admin/QueueActions";
import { KycDocumentViewer } from "@/components/admin/KycDocumentViewer";
import { countryName } from "@/lib/countries";

export const metadata = { title: "Verification queue" };
export const dynamic = "force-dynamic";

export default async function AdminKycPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, business_name, phone, country, kyc_type, kyc_status, created_at, kyc_submitted_at",
    )
    .eq("kyc_status", "pending")
    // Oldest SUBMISSION first, which is the order a review queue is worked
    // in. It used to order by created_at — account creation — so a user who
    // signed up a year ago and submitted this morning jumped the queue ahead
    // of someone who submitted last week. Nulls last: a pending row with no
    // submission date predates 0027 and the backfill, and guessing where it
    // belongs is worse than putting it at the end where it is visible.
    .order("kyc_submitted_at", { ascending: true, nullsFirst: false });

  if (!profiles || profiles.length === 0) {
    return (
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-semibold text-foreground">Verification queue</h1>
        <EmptyState
          title="Nothing waiting"
          body="Every submission has been reviewed."
          action={{ href: "/admin", label: "Back to admin" }}
        />
      </div>
    );
  }

  // Documents for every queued user in ONE query rather than one per row —
  // a per-row fetch inside the map would be a query per applicant.
  const { data: documents } = await admin
    .from("kyc_documents")
    .select("user_id, document_type, value, file_ref, status")
    .in(
      "user_id",
      profiles.map((p) => p.id),
    );

  const byUser = new Map<string, typeof documents>();
  for (const doc of documents ?? []) {
    const list = byUser.get(doc.user_id) ?? [];
    list.push(doc);
    byUser.set(doc.user_id, list);
  }

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-foreground">Verification queue</h1>

      <div className="space-y-4">
        {profiles.map((profile) => (
          <Card key={profile.id} className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-foreground">
                  {profile.business_name ?? profile.full_name ?? profile.email}
                </p>
                <p className="truncate text-sm text-muted-foreground">{profile.email}</p>
              </div>
              <Pill tone="pending">{profile.kyc_type ?? "individual"}</Pill>
            </div>

            <div>
              {profile.full_name && <DetailRow label="Name">{profile.full_name}</DetailRow>}
              {profile.phone && <DetailRow label="Phone">{profile.phone}</DetailRow>}
              {profile.country && (
                <DetailRow label="Country">{countryName(profile.country)}</DetailRow>
              )}
              {/* The real submission date (0027), not the account's creation
                  date this row used to show under the same label. The two
                  differ by months for anyone who signed up and verified
                  later, and the queue is worked by this figure. */}
              <DetailRow label="Submitted">
                {profile.kyc_submitted_at
                  ? new Date(profile.kyc_submitted_at).toLocaleString("en-GB")
                  : "Not recorded"}
              </DetailRow>
              <DetailRow label="Account created">
                {new Date(profile.created_at).toLocaleDateString("en-GB")}
              </DetailRow>
            </div>

            <div className="rounded-lg border border-border bg-secondary px-3">
              {(byUser.get(profile.id) ?? []).map((doc) => (
                <DetailRow
                  key={doc.document_type}
                  label={doc.document_type.replace(/_/g, " ")}
                  mono={!doc.file_ref}
                >
                  {/* A file_ref is a path into a private bucket — not a
                      viewable URL, and printing it was the whole of the
                      "review". The URL is signed on demand instead: most rows
                      are never opened, and a page whose HTML carried live links
                      to every queued applicant's ID is a worse thing to leave
                      in a history or a cache than a slow page. */}
                  {doc.file_ref ? (
                    <KycDocumentViewer
                      userId={profile.id}
                      path={doc.file_ref}
                      label={`${profile.full_name ?? profile.email} — ${doc.document_type.replace(
                        /_/g,
                        " ",
                      )}`}
                    />
                  ) : (
                    (doc.value ?? "—")
                  )}
                </DetailRow>
              ))}
            </div>

            <KycQueueActions userId={profile.id} />
          </Card>
        ))}
      </div>
    </div>
  );
}
