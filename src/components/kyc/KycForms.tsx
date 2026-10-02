"use client";

import { useActionState } from "react";
import { TextField, TextAreaField, FileField } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/Button";
import { Banner, Card } from "@/components/ui/Primitives";
import { submitIndividualKyc, submitBusinessKyc } from "@/lib/actions/kyc";
import type { KycIdField } from "@/lib/countries";

/**
 * KYC submission.
 *
 * The ID field is country-specific and passed in from the server, not guessed
 * at in the client: Nigeria uses a BVN or NIN, Ghana a Ghana Card number,
 * Kenya a national ID. Asking a Ghanaian for a BVN is the kind of detail that
 * makes an onboarding form feel built for somewhere else entirely.
 */
export function IndividualKycForm({
  idField,
  defaultFullName,
  defaultPhone,
  rejectionReason,
}: {
  idField: KycIdField;
  defaultFullName: string;
  defaultPhone: string;
  rejectionReason: string | null;
}) {
  const [state, formAction] = useActionState(submitIndividualKyc, {});

  return (
    <form action={formAction} className="space-y-4">
      {rejectionReason && (
        <Banner tone="danger" title="What we need you to fix">
          {rejectionReason}
        </Banner>
      )}

      <Card className="space-y-4">
        <TextField
          name="fullName"
          label="Full name"
          hint="Exactly as on your ID"
          defaultValue={defaultFullName}
          autoComplete="name"
          enterKeyHint="next"
          required
        />

        <p className="text-xs text-muted-foreground">
          This has to match the name on any account you withdraw to — we check it before sending
          money out, which is what stops payouts to someone else.
        </p>

        <TextField
          name="phone"
          label="Phone number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          enterKeyHint="next"
          required
          placeholder="+234…"
        />

        <TextField
          name="idNumber"
          label={idField.label}
          hint={idField.hint}
          inputMode={idField.documentType === "ghana_card_number" ? "text" : "numeric"}
          autoCapitalize="characters"
          autoCorrect="off"
          enterKeyHint="next"
          required
        />
      </Card>

      <Card className="space-y-4">
        <FileField
          name="selfie"
          label="A photo of you"
          hint="Required"
          accept="image/*"
          capture="user"
          required
        />

        <FileField
          name="idDocument"
          label={`A photo of your ${idField.label}`}
          hint="Required"
          accept="image/*,application/pdf"
          required
        />

        <FileField
          name="proofOfAddress"
          label="Proof of address"
          hint="Optional — raises your limits"
          accept="image/*,application/pdf"
        />
      </Card>

      {state.error && (
        <Banner tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      <SubmitButton pendingLabel="Uploading…">Submit for review</SubmitButton>
    </form>
  );
}

export function BusinessKycForm({
  defaultBusinessName,
  rejectionReason,
}: {
  defaultBusinessName: string;
  rejectionReason: string | null;
}) {
  const [state, formAction] = useActionState(submitBusinessKyc, {});

  return (
    <form action={formAction} className="space-y-4">
      {rejectionReason && (
        <Banner tone="danger" title="What we need you to fix">
          {rejectionReason}
        </Banner>
      )}

      <Card className="space-y-4">
        <TextField
          name="businessName"
          label="Registered business name"
          defaultValue={defaultBusinessName}
          enterKeyHint="next"
          required
        />

        <TextField
          name="tin"
          label="Tax identification number"
          inputMode="numeric"
          autoCorrect="off"
          enterKeyHint="next"
          required
        />

        <TextAreaField
          name="ownershipStructure"
          label="Ownership structure"
          hint="Optional"
          placeholder="Who owns the business, and in what proportions."
        />
      </Card>

      <Card className="space-y-4">
        <FileField
          name="registrationCertificate"
          label="Business registration certificate"
          hint="Required"
          accept="image/*,application/pdf"
          required
        />

        <FileField
          name="directorId"
          label="A director's ID"
          hint="Required"
          accept="image/*,application/pdf"
          required
        />

        <FileField
          name="proofOfBusinessAddress"
          label="Proof of business address"
          hint="Optional"
          accept="image/*,application/pdf"
        />
      </Card>

      {state.error && (
        <Banner tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      <SubmitButton pendingLabel="Uploading…">Submit for review</SubmitButton>
    </form>
  );
}
