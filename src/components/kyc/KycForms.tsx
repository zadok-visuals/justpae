"use client";

import { useActionState, useState } from "react";
import { TextField, TextAreaField } from "@/components/ui/Field";
import { UploadField } from "@/components/ui/UploadField";
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
 *
 * FILES DO NOT GO THROUGH THE SERVER ACTION. They are uploaded direct to
 * private storage by UploadField and the action receives only path strings.
 * Posting a phone photo inside the action's FormData exceeded the body limit
 * before the action ran, so the user got the framework's generic error page
 * with no explanation — see src/lib/storage/clientUpload.ts. `userId` is here
 * for exactly that reason: it is the first segment of the storage path, which
 * is what the bucket policy confines a user to.
 */
const KYC_BUCKET = "kyc-documents";

export function IndividualKycForm({
  idField,
  defaultFullName,
  defaultPhone,
  rejectionReason,
  userId,
  phoneHint,
}: {
  idField: KycIdField;
  defaultFullName: string;
  defaultPhone: string;
  rejectionReason: string | null;
  userId: string;
  /** Resolved server-side from the user's own country — see phoneHintFor. */
  phoneHint: string;
}) {
  const [state, formAction] = useActionState(submitIndividualKyc, {});

  // Submit waits for the two required uploads to SUCCEED, not merely for files
  // to have been picked. A hidden input's `required` is inert by spec, so this
  // is the gate.
  const [selfie, setSelfie] = useState<string | null>(null);
  const [idDocument, setIdDocument] = useState<string | null>(null);
  const uploadsReady = Boolean(selfie && idDocument);

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
          defaultValue={defaultPhone}
          placeholder={phoneHint}
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
        <UploadField
          name="selfie"
          label="A photo of you"
          hint="Required"
          accept="image/*"
          capture="user"
          bucket={KYC_BUCKET}
          userId={userId}
          prefix="selfie"
          onUploadedChange={setSelfie}
        />

        <UploadField
          name="idDocument"
          label={`A photo of your ${idField.label}`}
          hint="Required"
          accept="image/*,application/pdf"
          bucket={KYC_BUCKET}
          userId={userId}
          prefix="id-document"
          onUploadedChange={setIdDocument}
        />

        <UploadField
          name="proofOfAddress"
          label="Proof of address"
          hint="Optional — raises your limits"
          accept="image/*,application/pdf"
          bucket={KYC_BUCKET}
          userId={userId}
          prefix="proof-of-address"
        />
      </Card>

      {state.error && (
        <Banner tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      <SubmitButton disabled={!uploadsReady} pendingLabel="Submitting…">
        Submit for review
      </SubmitButton>
      {!uploadsReady && (
        <p className="text-center text-xs text-muted-foreground">
          Add your photo and your {idField.label} to continue.
        </p>
      )}
    </form>
  );
}

export function BusinessKycForm({
  defaultBusinessName,
  rejectionReason,
  userId,
}: {
  defaultBusinessName: string;
  rejectionReason: string | null;
  userId: string;
}) {
  const [state, formAction] = useActionState(submitBusinessKyc, {});

  const [certificate, setCertificate] = useState<string | null>(null);
  const [directorId, setDirectorId] = useState<string | null>(null);
  const uploadsReady = Boolean(certificate && directorId);

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
        <UploadField
          name="registrationCertificate"
          label="Business registration certificate"
          hint="Required"
          accept="image/*,application/pdf"
          bucket={KYC_BUCKET}
          userId={userId}
          prefix="registration-certificate"
          onUploadedChange={setCertificate}
        />

        <UploadField
          name="directorId"
          label="A director's ID"
          hint="Required"
          accept="image/*,application/pdf"
          bucket={KYC_BUCKET}
          userId={userId}
          prefix="director-id"
          onUploadedChange={setDirectorId}
        />

        <UploadField
          name="proofOfBusinessAddress"
          label="Proof of business address"
          hint="Optional"
          accept="image/*,application/pdf"
          bucket={KYC_BUCKET}
          userId={userId}
          prefix="proof-of-business-address"
        />
      </Card>

      {state.error && (
        <Banner tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      <SubmitButton disabled={!uploadsReady} pendingLabel="Submitting…">
        Submit for review
      </SubmitButton>
      {!uploadsReady && (
        <p className="text-center text-xs text-muted-foreground">
          Add your registration certificate and a director&apos;s ID to continue.
        </p>
      )}
    </form>
  );
}
