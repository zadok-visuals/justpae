import { requireAdminUser } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, EmptyState, Pill, DetailRow } from "@/components/ui/Primitives";
import { KycQueueActions } from "@/components/admin/QueueActions";
import { countryName } from "@/lib/countries";

export const metadata = { title: "Verification queue" };
export const dynamic = "force-dynamic";

export default async function AdminKycPage() {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, business_name, phone, country, kyc_type, kyc_status, created_at")
    .eq("kyc_status", "pending")
    .order("created_at");

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
              <DetailRow label="Submitted">
                {new Date(profile.created_at).toLocaleDateString("en-GB")}
              </DetailRow>
            </div>

            <div className="rounded-lg border border-border bg-secondary px-3">
              {(byUser.get(profile.id) ?? []).map((doc) => (
                <DetailRow key={doc.document_type} label={doc.document_type.replace(/_/g, " ")} mono>
                  {/* A file_ref is a path into the private bucket, not a
                      viewable URL. It is printed so a reviewer can find the
                      object; signing a URL per row on every page load would be
                      a request per document for files most rows never open. */}
                  {doc.value ?? doc.file_ref ?? "—"}
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
