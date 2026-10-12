"use client";

import { useActionState, useState } from "react";
import { TextField, TextAreaField, SelectField } from "@/components/ui/Field";
import { UploadField } from "@/components/ui/UploadField";
import { Button, SubmitButton } from "@/components/ui/Button";
import { Banner, Card } from "@/components/ui/Primitives";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { submitIndividualKyc, submitBusinessKyc } from "@/lib/actions/kyc";
import { GOVERNMENT_ID_TYPES, type KycIdField } from "@/lib/countries";

/**
 * STAGE TWO — ID submission, as a stepped wizard.
 *
 * WHY STEPS, given it was one page and one page is less code: the business
 * form asked for a registered name, a tax number, an ownership structure, a
 * certificate, a director's ID and a proof of address in a single scroll, with
 * one submit button at the bottom and nothing saying how much was left. Six
 * unrelated asks in one view is how a form gets abandoned halfway.
 *
 * EVERY STEP'S FIELDS STAY MOUNTED. Only visibility changes, via the `hidden`
 * attribute. This is the load-bearing detail of the whole file: conditionally
 * RENDERING the current step would unmount the others, which (a) loses what
 * the user typed when they press Back, and (b) drops those fields out of the
 * FormData the server action receives, so a 4-step submission would post only
 * step 4. Hiding keeps both the DOM state and the form payload intact.
 *
 * Consequently no input here carries `required`. Native validation on a hidden
 * field blocks submit with a message pointing at something the user cannot
 * see. Each step's validity is computed below and Continue says what is
 * missing instead.
 *
 * FILES DO NOT GO THROUGH THE SERVER ACTION — UploadField puts them straight
 * into private storage and the form carries only path strings. See
 * src/lib/storage/clientUpload.ts for the production crash that caused.
 */
const KYC_BUCKET = "kyc-documents";

/** Shared chrome: the indicator, the step's own heading, and Back/Continue. */
function WizardStep({
  active,
  step,
  total,
  title,
  blurb,
  children,
}: {
  active: boolean;
  step: number;
  total: number;
  title: string;
  blurb?: string;
  children: React.ReactNode;
}) {
  return (
    <div hidden={!active} className="space-y-4">
      <StepIndicator step={step} total={total} />
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {blurb && <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>}
      </div>
      {children}
    </div>
  );
}

function WizardNav({
  step,
  total,
  canContinue,
  blockedReason,
  onBack,
  onNext,
  submitLabel,
  pendingLabel,
}: {
  step: number;
  total: number;
  canContinue: boolean;
  blockedReason: string | null;
  onBack: () => void;
  onNext: () => void;
  submitLabel: string;
  pendingLabel: string;
}) {
  const isLast = step === total;

  return (
    <div className="space-y-2">
      <div className="flex gap-3">
        {step > 1 && (
          <Button type="button" variant="secondary" size="lg" onClick={onBack}>
            Back
          </Button>
        )}

        {isLast ? (
          <SubmitButton disabled={!canContinue} pendingLabel={pendingLabel}>
            {submitLabel}
          </SubmitButton>
        ) : (
          <Button
            type="button"
            size="lg"
            fullWidth
            disabled={!canContinue}
            onClick={onNext}
          >
            Continue
          </Button>
        )}
      </div>

      {/* Why Continue is off, not merely that it is. A disabled button with no
          explanation is the single most common dead end in a stepped form. */}
      {!canContinue && blockedReason && (
        <p className="text-center text-xs text-muted-foreground" aria-live="polite">
          {blockedReason}
        </p>
      )}
    </div>
  );
}

export function IndividualKycForm({
  idField,
  defaultFullName,
  rejectionReason,
  userId,
  usesBvnOrNin,
}: {
  idField: KycIdField;
  defaultFullName: string;
  rejectionReason: string | null;
  userId: string;
  /** Decided server-side from the stored country — never in the browser. */
  usesBvnOrNin: boolean;
}) {
  const [state, formAction] = useActionState(submitIndividualKyc, {});
  const [step, setStep] = useState(1);
  const TOTAL = 2;

  const [fullName, setFullName] = useState(defaultFullName);
  const [idNumber, setIdNumber] = useState("");
  const [idType, setIdType] = useState("");
  const [governmentId, setGovernmentId] = useState<string | null>(null);

  const blockedReason = (() => {
    if (step !== 1) return null;
    if (!fullName.trim()) return "Enter your full name to continue.";
    if (!idNumber.trim()) return `Enter your ${idField.label.toLowerCase()} to continue.`;
    if (!usesBvnOrNin && !idType) return "Tell us which ID this is to continue.";
    if (!governmentId) return "Add a photo of your ID to continue.";
    return null;
  })();

  const canContinue = blockedReason === null;

  return (
    <form action={formAction} className="space-y-4">
      {rejectionReason && (
        <Banner tone="danger" title="What we need you to fix">
          {rejectionReason}
        </Banner>
      )}

      <WizardStep
        active={step === 1}
        step={1}
        total={TOTAL}
        title="Your identity"
        blurb="This goes to a human reviewer. We don't share it."
      >
        <Card className="space-y-4">
          <TextField
            name="fullName"
            label="Full name"
            hint="Exactly as on your ID"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            enterKeyHint="next"
          />

          <p className="text-xs text-muted-foreground">
            This has to match the name on any account you withdraw to — we check it before
            sending money out, which is what stops payouts to someone else.
          </p>

          {!usesBvnOrNin && (
            <SelectField
              name="idType"
              label="What ID is this?"
              value={idType}
              onChange={(e) => setIdType(e.target.value)}
            >
              <option value="">Choose one</option>
              {GOVERNMENT_ID_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </SelectField>
          )}

          <TextField
            name="idNumber"
            label={idField.label}
            hint={idField.hint}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            inputMode={usesBvnOrNin ? "numeric" : "text"}
            autoCapitalize="characters"
            autoCorrect="off"
            enterKeyHint="next"
          />
        </Card>

        <Card>
          <UploadField
            name="governmentId"
            label="A photo of your ID"
            hint="Required"
            // Rear camera on a phone: this is a photo OF a document, not of
            // the user. capture="user" would open the selfie camera.
            accept="image/*,application/pdf"
            capture="environment"
            bucket={KYC_BUCKET}
            userId={userId}
            prefix="government-id"
            onUploadedChange={setGovernmentId}
          />
        </Card>
      </WizardStep>

      <WizardStep
        active={step === 2}
        step={2}
        total={TOTAL}
        title="Proof of address"
        blurb="A utility bill, bank statement or tenancy agreement from the last three months."
      >
        <Card>
          <UploadField
            name="proofOfAddress"
            label="Proof of address"
            hint="Optional — raises your limits"
            accept="image/*,application/pdf"
            capture="environment"
            bucket={KYC_BUCKET}
            userId={userId}
            prefix="proof-of-address"
          />
        </Card>

        <p className="text-xs text-muted-foreground">
          You can submit without this and add it later — it only affects how much you can move
          at once.
        </p>
      </WizardStep>

      {state.error && (
        <Banner tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      <WizardNav
        step={step}
        total={TOTAL}
        canContinue={canContinue}
        blockedReason={blockedReason}
        onBack={() => setStep((s) => s - 1)}
        onNext={() => setStep((s) => s + 1)}
        submitLabel="Submit for review"
        pendingLabel="Submitting…"
      />
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
  const [step, setStep] = useState(1);
  const TOTAL = 4;

  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [tin, setTin] = useState("");
  const [certificate, setCertificate] = useState<string | null>(null);
  const [directorId, setDirectorId] = useState<string | null>(null);

  const blockedReason = (() => {
    if (step === 1 && !businessName.trim()) {
      return "Enter your registered business name to continue.";
    }
    if (step === 2) {
      if (!tin.trim()) return "Enter your tax identification number to continue.";
      if (!certificate) return "Add your registration certificate to continue.";
    }
    if (step === 3 && !directorId) return "Add a director's ID to continue.";
    return null;
  })();

  const canContinue = blockedReason === null;

  return (
    <form action={formAction} className="space-y-4">
      {rejectionReason && (
        <Banner tone="danger" title="What we need you to fix">
          {rejectionReason}
        </Banner>
      )}

      <WizardStep
        active={step === 1}
        step={1}
        total={TOTAL}
        title="Business details"
        blurb="As registered, not as traded — the name on the certificate."
      >
        <Card className="space-y-4">
          <TextField
            name="businessName"
            label="Registered business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            enterKeyHint="next"
          />

          <TextAreaField
            name="ownershipStructure"
            label="Ownership structure"
            hint="Optional"
            placeholder="Who owns the business, and in what proportions."
          />
        </Card>
      </WizardStep>

      <WizardStep
        active={step === 2}
        step={2}
        total={TOTAL}
        title="Registration and tax"
        blurb="Your incorporation certificate and the tax number on it."
      >
        <Card className="space-y-4">
          <TextField
            name="tin"
            label="Tax identification number"
            value={tin}
            onChange={(e) => setTin(e.target.value)}
            inputMode="numeric"
            autoCorrect="off"
            enterKeyHint="next"
          />

          <UploadField
            name="registrationCertificate"
            label="Business registration certificate"
            hint="Required"
            accept="image/*,application/pdf"
            capture="environment"
            bucket={KYC_BUCKET}
            userId={userId}
            prefix="registration-certificate"
            onUploadedChange={setCertificate}
          />
        </Card>
      </WizardStep>

      <WizardStep
        active={step === 3}
        step={3}
        total={TOTAL}
        title="Director's ID"
        blurb="Any one director's government ID is enough to start the review."
      >
        <Card>
          <UploadField
            name="directorId"
            label="A director's ID"
            hint="Required"
            accept="image/*,application/pdf"
            capture="environment"
            bucket={KYC_BUCKET}
            userId={userId}
            prefix="director-id"
            onUploadedChange={setDirectorId}
          />
        </Card>
      </WizardStep>

      <WizardStep
        active={step === 4}
        step={4}
        total={TOTAL}
        title="Proof of business address"
        blurb="A utility bill or bank statement in the business's name."
      >
        <Card>
          <UploadField
            name="proofOfBusinessAddress"
            label="Proof of business address"
            hint="Optional"
            accept="image/*,application/pdf"
            capture="environment"
            bucket={KYC_BUCKET}
            userId={userId}
            prefix="proof-of-business-address"
          />
        </Card>

        <p className="text-xs text-muted-foreground">
          You can submit without this and add it later.
        </p>
      </WizardStep>

      {state.error && (
        <Banner tone="danger" title="Couldn't submit that">
          {state.error}
        </Banner>
      )}

      <WizardNav
        step={step}
        total={TOTAL}
        canContinue={canContinue}
        blockedReason={blockedReason}
        onBack={() => setStep((s) => s - 1)}
        onNext={() => setStep((s) => s + 1)}
        submitLabel="Submit for review"
        pendingLabel="Submitting…"
      />
    </form>
  );
}
