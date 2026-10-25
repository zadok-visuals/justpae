export type KycType = "individual" | "business";
export type KycStatus = "not_started" | "pending" | "approved" | "rejected";
export type KycTier = "individual_tier_1" | "individual_tier_2" | "individual_tier_3" | "business";
export type DocumentStatus = "pending" | "approved" | "rejected";

/**
 * The wallet/ledger currency enum, mirroring the Postgres `currency` type in
 * supabase/migrations/0001_init.sql.
 *
 * USD is a FIRST-CLASS wallet here, unlike the app this foundation came from —
 * every user gets one regardless of country (see handle_new_user). The local
 * wallet (NGN/GHS/KES) is provisioned from the signup country.
 *
 * To add a currency: add the value to the Postgres enum in its own migration
 * (it cannot be added and used in the same transaction — see 0025), then add
 * one entry to CURRENCIES in src/lib/currencies.ts. Nothing else in the app
 * hardcodes the list.
 *
 * CNY (0025) is unlike every other entry here: it is a SYNTHETIC ledger
 * balance. No provider holds yuan for this business, so a CNY balance is an
 * internal obligation — created by converting into it, discharged by spending
 * it through Pay to China or converting back out. It cannot be withdrawn, and
 * 0026 enforces that with a trigger rather than leaving it to the UI.
 */
export type Currency = "USD" | "NGN" | "GHS" | "KES" | "USDT" | "CNY";

/**
 * Free-form ISO 3166-1 alpha-2, not a fixed enum — a user's real country is
 * stored as-is even when no local wallet exists for it. Only the codes in
 * LOCAL_WALLET_COUNTRIES (src/lib/countries.ts) get one provisioned.
 */
export type CountryCode = string;

/**
 * 'pay_to_china' (migration 0025) is deliberately its own type rather than a
 * 'convert' or a 'withdrawal'. Both of those have automated provider paths,
 * webhook settlement and refund rules that simply do not apply to a request a
 * person fulfils by hand and photographs the receipt of.
 */
export type TransactionType = "convert" | "withdrawal" | "pay_to_china";
/** 'korapay' added in 0039 — naira virtual accounts, and a second payout
 *  route for NGN and KES. */
export type TransactionProvider = "busha" | "klasha" | "manual" | "korapay";
/**
 * 'partially_completed' (migration 0023) is a conversion-only terminal state:
 * leg 1 of a fiat-to-fiat bridge converted the source into USDT and leg 2 did
 * not deliver. The money is neither where it started nor where it was going,
 * and the user owns the USDT — 'failed' would trigger a source refund that
 * pays them twice, and 'completed' would claim a delivery that never happened.
 */
/**
 * 'expired' (migration 0029) is a DEPOSIT state and nothing else: the
 * provider's transfer details reached their deadline with no money received.
 * It is deliberately not 'failed' — nothing went wrong and nothing was taken,
 * and telling someone their money failed when they never sent any is how a
 * support thread starts.
 */
/**
 * 'awaiting_review' (migration 0036) is a MANUAL DEPOSIT state and nothing
 * else: the customer says they have made the bank transfer and no human has
 * confirmed it arrived. Not 'pending' (which means we are waiting on the
 * customer) and not 'processing' (which everywhere else means a provider is
 * holding the money) — nobody holds anything yet except a claim.
 */
export type TransactionStatus =
  | "pending"
  | "processing"
  | "awaiting_review"
  | "completed"
  | "failed"
  | "partially_completed"
  | "expired";

/** Migration 0037. How a deposit is funded: a provider rail, or a bank
 *  transfer the customer makes themselves and an admin confirms. */
export type DepositMethod = "provider" | "manual_bank_transfer";

/** 'education' added by migration 0031 (Group 4e). Nothing writes it while
 *  BILLS_ENABLED is off; it exists so the category tile has somewhere to go
 *  the moment a provider is chosen. */
export type BillCategory =
  | "airtime"
  | "data"
  | "electricity"
  | "water"
  | "cable_tv"
  | "education";
export type BillStatus = "pending" | "processing" | "completed" | "failed" | "refunded";

/**
 * NOTE: these row shapes must stay `type` aliases, not `interface` — this
 * version of @supabase/postgrest-js's select-query type parser silently
 * resolves query results to `never` when a Row type is declared as an
 * interface instead of a plain object type.
 */
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  business_name: string | null;
  kyc_type: KycType | null;
  kyc_status: KycStatus;
  kyc_rejection_reason: string | null;
  /**
   * When the identity check was last SUBMITTED, which is not when the account
   * was created and is not when any document row was written (0027). Null for
   * an account that has never submitted. Written only by submit_kyc_profile,
   * in the same statement that sets kyc_status, so the two cannot disagree.
   */
  kyc_submitted_at: string | null;
  country: CountryCode | null;
  /**
   * Phase 4 suspension. Not writable from a user session at any privilege: the
   * column grants exclude all three, and profiles_guard_protected_columns
   * refuses the change however the write arrived. Enforcement is a BEFORE
   * INSERT trigger on transactions, bill_payments and deposits — see 0019 for
   * why that rather than a check inside each money function.
   */
  suspended_at: string | null;
  suspended_reason: string | null;
  suspended_by: string | null;
  /**
   * General-announcement email only (migration 0035) — the admin broadcast
   * composer, nothing else. Account and security email (PIN locks,
   * withdrawals, KYC decisions) ignores this and always sends.
   */
  email_announcements: boolean;
  created_at: string;
};

/** Phase 4. 'superadmin' additionally grants and revokes admin access. */
export type AdminRole = "admin" | "superadmin";

/**
 * The admin roster (0019). No RLS policy and no grants to any user session:
 * it is a list of the highest-value accounts in the system. Revoked grants
 * stay as rows with revoked_at set, because "X was an admin between these
 * dates" is a fact an investigation needs.
 */
export type AdminUser = {
  user_id: string;
  role: AdminRole;
  granted_by: string | null;
  granted_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  /** True when the row came from the ADMIN_EMAILS bootstrap rather than a
   *  superadmin's grant, so the ledger never claims a human granted it. */
  bootstrapped: boolean;
};

/** The audit ledger (0019). Append-only — there is no update or delete path. */
export type AdminActivityLogEntry = {
  id: number;
  admin_id: string | null;
  /** Denormalised at write time so the entry still names the actor after the
   *  account is gone. */
  admin_email: string | null;
  /** A short stable verb, e.g. 'kyc.approve', 'user.suspend', 'role.grant'. */
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
};

/** The shape admin_dashboard_stats() returns. Every figure is counted from the
 *  tables — there is no placeholder number in it. */
export type AdminDashboardStats = {
  users_total: number;
  users_new_7d: number;
  users_suspended: number;
  kyc_pending: number;
  kyc_approved: number;
  withdrawals_queued: number;
  withdrawals_flagged: number;
  automation_failed: number;
  manual_review: number;
  deposits_pending: number;
  transactions_7d: number;
  transactions_completed_7d: number;
  support_unread: number;
  support_threads: number;
  admins_active: number;
};

export type Wallet = {
  user_id: string;
  currency: Currency;
  balance: number;
  updated_at: string;
};

export type KycDocument = {
  id: string;
  user_id: string;
  tier: KycTier;
  document_type: string;
  file_ref: string | null;
  value: string | null;
  status: DocumentStatus;
  created_at: string;
};

export type Transaction = {
  id: string;
  user_id: string;
  type: TransactionType;
  provider: TransactionProvider;
  status: TransactionStatus;
  amount: number;
  currency: Currency;
  target_currency: Currency | null;
  target_amount: number | null;
  /** What the provider actually delivered, when it differs from the quote. */
  actual_target_amount: number | null;
  provider_reference: string | null;
  /**
   * Conversion rate audit trail (the pattern migration 0025 of the source
   * project established for swaps, generalised here so /admin/pnl can report
   * profit per order):
   *   provider_rate — the raw rate the provider quoted, before any markup
   *   markup_rate   — the fraction applied, e.g. 0.005 for 0.5%
   *   customer_rate — what the customer was actually shown and settled at
   *   raw_target_amount — what the provider delivered pre-markup
   * The gap between raw_target_amount and target_amount is the margin.
   */
  provider_rate: number | null;
  markup_rate: number | null;
  customer_rate: number | null;
  raw_target_amount: number | null;
  fee: number | null;
  requires_extra_verification: boolean;
  extra_verification_confirmed_at: string | null;
  extra_verification_confirmed_by: string | null;
  automated_payout_attempt_failed_reason: string | null;
  automated_payout_retry_count: number;
  /**
   * Set when the provider's own transfer object disagreed with this row — a
   * different source amount, a different currency pair, or a target amount
   * outside rounding tolerance. Such a row is NEVER completed automatically
   * (see 0010 and the reconciler): a mismatch is either our bug or someone
   * pointing a row at a transfer that isn't its own, and both need a human.
   */
  needs_manual_review: boolean;
  manual_review_reason: string | null;
  decline_reason: string | null;
  /** 0024's leg trail, copied off the quote row at settle time. See
   *  ConversionQuoteRow for what each one means. */
  bridge_currency: Currency | null;
  leg1_provider_reference: string | null;
  leg2_provider_reference: string | null;
  leg1_target_amount: number | null;
  /** What a partial completion actually credited. Kept distinct from
   *  leg1_target_amount so a later correction is visible rather than
   *  silently overwriting the provider's reported figure. */
  partial_credit_amount: number | null;
  /** When the user was told this transaction reached a terminal state. The
   *  exactly-once marker from 0018 — completed and failed are mutually
   *  exclusive, so one stamp per row covers both. */
  notified_at: string | null;
  /**
   * Path inside the private 'pay-to-china-proof' bucket (0026). Set by an
   * admin when a Pay to China request is completed — the screenshot of the
   * payment actually landing. Read through a signed URL, never a public one.
   */
  payment_proof_ref: string | null;
  created_at: string;
};

export type WebhookEvent = {
  id: string;
  provider: string;
  event_type: string;
  /**
   * Per-delivery identity, unique per provider (migration 0021). Null when the
   * delivery carried nothing stable to key on — such rows are recorded but not
   * deduplicated.
   */
  event_key: string | null;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
};

export type Deposit = {
  id: string;
  user_id: string;
  currency: Currency;
  amount: number;
  confirmed_amount: number | null;
  status: TransactionStatus;
  provider: TransactionProvider;
  provider_reference: string | null;
  decline_reason: string | null;
  /** When the user was told this deposit was credited. See 0018 and
   *  claim_deposit_notification — null means nobody has announced it yet. */
  notified_at: string | null;
  /**
   * When the provider's transfer details stop accepting money (migration
   * 0030). Null when the provider returned no expiry, which expire_deposit
   * treats as "no known deadline" rather than as "expires now".
   */
  pay_in_expires_at: string | null;
  created_at: string;

  // ── Migration 0037: manual bank transfer ────────────────────────────────
  method: DepositMethod;
  /** The JP######## code the customer puts in their transfer narration, and
   *  the only thing tying a bank-statement line to this row. */
  reference: string | null;
  /** What an admin read off the bank statement, before the fee. Entered
   *  server-side; never supplied by the browser. `confirmed_amount` keeps its
   *  meaning across every rail — what landed in the wallet. */
  received_amount: number | null;
  fee: number | null;
  /** Path in the private `deposit-proof` bucket. Optional. */
  screenshot_path: string | null;
  marked_sent_at: string | null;
  /** The admin who COMPLETED the decision — on a dual-admin approval, the
   *  second one. */
  reviewed_by: string | null;
  reviewed_at: string | null;
  /** The first half of a dual-admin approval (>= 1,000,000 NGN). The amount
   *  is held so the second admin has to agree the same figure. */
  first_approver_id: string | null;
  first_approved_at: string | null;
  first_approval_amount: number | null;

  // ── Migration 0040: virtual-account deposits ────────────────────────────
  /** What the PROVIDER deducted from the settlement. Recorded, never charged
   *  on — the customer's credit is received_amount minus `fee`, ours. */
  provider_fee: number | null;
  /** Which issued account number it arrived in. Null on every other rail. */
  virtual_account_id: string | null;
};

/**
 * A permanent provider-issued account number (migration 0040).
 *
 * Readable by its owner, writable by nobody but the service role — there is
 * no insert, update or delete policy on the table, deliberately.
 */
export type VirtualAccount = {
  id: string;
  user_id: string;
  currency: Currency;
  provider: TransactionProvider;
  account_number: string;
  bank_name: string;
  account_name: string;
  /** OUR reference, passed as account_reference when the account was created
   *  and used to look it up again at the provider. */
  provider_reference: string;
  status: string;
  created_at: string;
};

/**
 * Migration 0031. A user's "tell me when this opens" mark for one flagged-off
 * feature. Deliberately generic — `feature` is text so a new flag needs no
 * schema change — and deliberately not a column on `profiles`, whose narrow
 * UPDATE grant is load-bearing (see 0011).
 */
export type FeatureInterest = {
  user_id: string;
  feature: string;
  created_at: string;
};

export type WithdrawalRecipient = {
  user_id: string;
  currency: Currency;
  account_holder_name: string;
  bank_account_number: string | null;
  bank_name: string | null;
  wallet_address: string | null;
  bank_code: string | null;
  network: string | null;
  busha_recipient_id: string | null;
  pending_change_requested_at: string | null;
  recipient_changed_at: string | null;
  recipient_changed_by: string | null;
  created_at: string;
};

/**
 * NOTE: pin_hash is deliberately absent from this type, and the table is no
 * longer readable by `authenticated` at all (0012 dropped the select policy
 * that exposed it and revoked the table grants). Whether a user has a PIN is
 * answered by the has_transaction_pin() RPC.
 */
export type WithdrawalPin = {
  user_id: string;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * In-app notification. `user_id` null means a broadcast to every user.
 *
 * There is deliberately no `read_at` on this row: read state lives in
 * notification_reads, one row per (notification, user). A single column here
 * would make a broadcast's read state shared — the first person to open it
 * would mark it read for everyone — which is the flaw the ported original
 * carried. See supabase/migrations/0017.
 */
export type Notification = {
  id: string;
  user_id: string | null;
  title: string;
  body: string;
  /** Relative in-app path only, enforced by a check constraint. */
  href: string | null;
  /** Path into a private bucket, for a notification that carries a file —
   *  today only a Pay to China payment proof (0026). Read through a signed
   *  URL; the bucket is never public. */
  attachment_ref: string | null;
  created_by: string | null;
  created_at: string;
};

export type NotificationRead = {
  notification_id: string;
  user_id: string;
  read_at: string;
};

export type SupportSender = "user" | "admin";

/** One thread per user. `body` is nullable because an image-only message has
 *  no text; a check constraint requires one or the other. */
export type SupportMessage = {
  id: string;
  user_id: string;
  sender: SupportSender;
  body: string | null;
  /** Path into the private support-attachments bucket. */
  attachment_ref: string | null;
  /** Stamped when the OTHER side has seen it. Not writable by users. */
  read_at: string | null;
  created_at: string;
};

/** See the conversion_quotes table entry below for why this exists. */
export type ConversionQuoteRow = {
  id: string;
  user_id: string;
  source_currency: Currency;
  target_currency: Currency;
  source_amount: number;
  target_amount: number;
  provider_rate: number | null;
  markup_rate: number | null;
  customer_rate: number | null;
  raw_target_amount: number | null;
  /** Written by server code after the provider call returned. Never an
   *  argument a caller supplies. */
  provider_reference: string | null;
  /**
   * 0024's leg trail. A fiat-to-fiat conversion runs as two provider legs
   * bridged through USDT, so there are two references and an intermediate
   * amount to record. All four are null on a single-leg conversion, and
   * `bridge_currency is null` is exactly what partially_complete_conversion
   * refuses on — a row with no bridge has no intermediate holding to credit.
   */
  bridge_currency: Currency | null;
  leg1_provider_reference: string | null;
  leg2_provider_reference: string | null;
  /** Markup-adjusted USDT leg 1 delivered. Written by server code from the
   *  provider's own leg-1 response; it is what a partial completion credits. */
  leg1_target_amount: number | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

// ── CNY and Pay to China (migration 0026) ──────────────────────────────────

export type PayoutMethod = "alipay" | "wechat" | "bank";

/**
 * The CNY size ladder: CNY per 1 USDT, by order size.
 *
 * PRICES, NEVER DISPLAYS. The table has RLS on and no policy at all, so a
 * customer session cannot read it — see 0026 for why that is a schema
 * property rather than a component decision.
 */
export type CnyTierRate = {
  tier_min_cny: number;
  tier_max_cny: number;
  usdt_to_cny_rate: number;
  updated_at: string;
};

/** Singleton. Fiat and USDT payers carry genuinely different agreed spreads. */
export type CnyMarkupRate = {
  id: boolean;
  fiat_markup_rate: number;
  usdt_markup_rate: number;
  updated_at: string;
};

/**
 * What this business PAYS its own supplier, as distinct from what it charges.
 * Append-only: a new rate is a new row with its own effective_from, so "what
 * did an order placed in March cost us" has an answer in March's terms.
 * Direction, as everywhere: QUOTE per 1 BASE.
 */
export type SupplierRate = {
  id: string;
  base_currency: Currency;
  quote_currency: Currency;
  buy_rate: number;
  effective_from: string;
  set_by: string | null;
  created_at: string;
};

/**
 * The recipient of ONE Pay to China request — a snapshot, written at submit
 * time and never updated, so a request settled three days later shows the
 * admin the details the customer actually gave.
 *
 * A QR code alone is a complete recipient: the check constraints require a
 * typed id OR a QR for Alipay/WeChat, never both.
 */
export type PayToChinaRecipient = {
  id: string;
  user_id: string;
  transaction_id: string | null;
  payout_method: PayoutMethod;
  recipient_first_name: string | null;
  recipient_last_name: string | null;
  recipient_alipay_id: string | null;
  recipient_wechat_id: string | null;
  recipient_bank_account_number: string | null;
  recipient_bank_name: string | null;
  recipient_account_holder_name: string | null;
  /** Path inside the private 'pay-to-china-qr' bucket. */
  qr_code_ref: string | null;
  created_at: string;
};

/** A reusable recipient, never attached to a transaction. */
export type SavedPayToChinaRecipient = PayToChinaRecipient & { label: string };

/**
 * The server-written figures a Pay to China request settles at.
 *
 * Same contract as conversion_quotes: the function that spends this is given
 * nothing but the row's id, so there is no argument through which an amount
 * can arrive from a browser. RLS on, no policies, grants revoked.
 */
export type PayToChinaQuoteRow = {
  id: string;
  user_id: string;
  source_currency: Currency;
  source_amount: number;
  target_cny: number;
  provider_rate: number | null;
  tier_rate: number | null;
  markup_rate: number | null;
  raw_target_cny: number | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

/**
 * Per-pair, per-direction percentage markup, editable from /admin/rates.
 * `direction` distinguishes e.g. NGN->USDT from USDT->NGN, which carry
 * genuinely different spreads on the provider side.
 */
export type RateMarkup = {
  id: string;
  base_currency: Currency;
  quote_currency: Currency;
  markup_rate: number;
  updated_at: string;
  updated_by: string | null;
};

/** Single-row key/value store for operator-tunable settings. */
export type AppSetting = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type BillPayment = {
  id: string;
  user_id: string;
  category: BillCategory;
  country: string;
  biller_code: string;
  biller_name: string;
  /** Phone number, meter number or smartcard number, depending on category. */
  customer_identifier: string;
  customer_name: string | null;
  amount: number;
  currency: Currency;
  fee: number;
  status: BillStatus;
  provider: string;
  provider_reference: string | null;
  /** Prepaid electricity token, shown large with a copy button on the receipt. */
  token: string | null;
  units: string | null;
  decline_reason: string | null;
  created_at: string;
};

export type BillBeneficiary = {
  id: string;
  user_id: string;
  label: string;
  category: BillCategory;
  country: string;
  biller_code: string;
  biller_name: string;
  customer_identifier: string;
  created_at: string;
};

/** Per-user USD receiving details, created only by a verified provider webhook. */
export type UsdCollectionAccount = {
  id: string;
  user_id: string;
  provider: string;
  account_name: string | null;
  account_number: string | null;
  routing_number: string | null;
  bank_name: string | null;
  bank_address: string | null;
  account_type: string | null;
  reference_code: string;
  status: "pending" | "active" | "disabled";
  created_at: string;
};

/**
 * One row of migration 0027's `admin_activity_ledger` — every money movement
 * in the product, from `transactions`, `deposits` and `bill_payments`, with
 * the user already joined on.
 *
 * `kind` is a plain string rather than a union of the three source enums
 * because it genuinely is one: the view emits transaction types verbatim,
 * `'deposit'`, and `'bill_' || category`. A union here would have to be kept
 * in step with three Postgres enums by hand, and the page only ever renders
 * it through `ledgerKindLabel`.
 *
 * `(source, id)` is the identity of a row. Ids are unique per table, not
 * across them.
 */
export type AdminActivityLedgerRow = {
  source: "transaction" | "deposit" | "bill";
  id: string;
  user_id: string;
  user_email: string;
  user_name: string | null;
  kind: string;
  /**
   * Widened to include BillStatus, which carries `refunded` and the
   * transaction enum does not. A bill row really can arrive with a status no
   * transaction can have, and narrowing this to TransactionStatus would be
   * the type lying about the data rather than describing it.
   */
  status: TransactionStatus | BillStatus;
  currency: Currency;
  amount: number;
  target_currency: Currency | null;
  target_amount: number | null;
  fee: number | null;
  provider: string | null;
  reference: string | null;
  decline_reason: string | null;
  created_at: string;
};

/**
 * Two things in this type exist purely to satisfy @supabase/postgrest-js's
 * `GenericSchema` constraint, and both are load-bearing rather than
 * decoration — getting either wrong produces errors that look like the
 * database is wrong rather than the type:
 *
 *  - `Views`. If the schema does not structurally match `GenericSchema`, the
 *    client silently falls back to an untyped schema: every `.rpc()` call's
 *    args parameter resolves to `undefined` ("Argument of type {...} is not
 *    assignable to parameter of type 'undefined'") and every narrowed select
 *    resolves to `never`. One view now (0027's ledger), so the mapped type is
 *    no longer empty — but it still has to carry `Relationships` for the same
 *    reason the Tables entries do.
 *
 *  - `Relationships: []` on every Tables entry. Without the key, the
 *    select-query type parser resolves a narrowed select (e.g.
 *    `.select("markup_rate")`) to `never`, which turns every field access on
 *    the result into a compile error that reads like a missing column. The
 *    arrays are empty because nothing here uses the typed-embed syntax; the
 *    key simply has to be present.
 */
export type Database = {
  public: {
    Views: {
      admin_activity_ledger: { Row: AdminActivityLedgerRow; Relationships: [] };
    };
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; email: string }; Update: Partial<Profile>; Relationships: [] };
      admin_users: {
        Row: AdminUser;
        Insert: Partial<AdminUser> & { user_id: string };
        Update: Partial<AdminUser>; Relationships: [];
      };
      admin_activity_log: {
        Row: AdminActivityLogEntry;
        Insert: Partial<AdminActivityLogEntry> & { action: string };
        Update: Partial<AdminActivityLogEntry>; Relationships: [];
      };
      wallets: { Row: Wallet; Insert: Partial<Wallet> & { user_id: string; currency: Currency }; Update: Partial<Wallet>; Relationships: [] };
      kyc_documents: {
        Row: KycDocument;
        Insert: Partial<KycDocument> & { user_id: string; tier: KycTier; document_type: string };
        Update: Partial<KycDocument>; Relationships: [];
      };
      transactions: {
        Row: Transaction;
        Insert: Partial<Transaction> & {
          user_id: string;
          type: TransactionType;
          provider: TransactionProvider;
          amount: number;
          currency: Currency;
        };
        Update: Partial<Transaction>; Relationships: [];
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Partial<WebhookEvent> & { provider: string; event_type: string; payload: Record<string, unknown> };
        Update: Partial<WebhookEvent>; Relationships: [];
      };
      deposits: {
        Row: Deposit;
        Insert: Partial<Deposit> & {
          user_id: string;
          currency: Currency;
          amount: number;
          provider: TransactionProvider;
        };
        Update: Partial<Deposit>; Relationships: [];
      };
      virtual_accounts: {
        Row: VirtualAccount;
        Insert: Partial<VirtualAccount> & {
          user_id: string;
          currency: Currency;
          provider: TransactionProvider;
          account_number: string;
          bank_name: string;
          account_name: string;
          provider_reference: string;
        };
        Update: Partial<VirtualAccount>; Relationships: [];
      };
      withdrawal_recipients: {
        Row: WithdrawalRecipient;
        Insert: Partial<WithdrawalRecipient> & { user_id: string; currency: Currency; account_holder_name: string };
        Update: Partial<WithdrawalRecipient>; Relationships: [];
      };
      withdrawal_pins: { Row: WithdrawalPin; Insert: { user_id: string }; Update: Partial<WithdrawalPin>; Relationships: [] };
      rate_markups: {
        Row: RateMarkup;
        Insert: Partial<RateMarkup> & { base_currency: Currency; quote_currency: Currency; markup_rate: number };
        Update: Partial<RateMarkup>; Relationships: [];
      };
      app_settings: { Row: AppSetting; Insert: Partial<AppSetting> & { key: string; value: string }; Update: Partial<AppSetting>; Relationships: [] };
      bill_payments: {
        Row: BillPayment;
        Insert: Partial<BillPayment> & {
          user_id: string;
          category: BillCategory;
          country: string;
          biller_code: string;
          biller_name: string;
          customer_identifier: string;
          amount: number;
          currency: Currency;
        };
        Update: Partial<BillPayment>; Relationships: [];
      };
      bill_beneficiaries: {
        Row: BillBeneficiary;
        Insert: Partial<BillBeneficiary> & {
          user_id: string;
          label: string;
          category: BillCategory;
          country: string;
          biller_code: string;
          biller_name: string;
          customer_identifier: string;
        };
        Update: Partial<BillBeneficiary>; Relationships: [];
      };
      /** Migration 0031. "Notify me when this opens", one row per
       *  (user, feature). No mutable column: turning the toggle off is a
       *  delete, which is why there is no meaningful Update shape. */
      feature_interest: {
        Row: FeatureInterest;
        Insert: { user_id: string; feature: string; created_at?: string };
        Update: Partial<FeatureInterest>; Relationships: [];
      };
      usd_collection_accounts: {
        Row: UsdCollectionAccount;
        Insert: Partial<UsdCollectionAccount> & { user_id: string; provider: string; reference_code: string };
        Update: Partial<UsdCollectionAccount>; Relationships: [];
      };
      /**
       * The server's own record of a price it quoted. RLS is on with NO
       * policies and the table grants are revoked, so only the service-role
       * client can touch it — which is the point: the figures a conversion
       * settles at must come from a row the server wrote, never from a
       * function argument. See supabase/migrations/0010.
       */
      notifications: {
        Row: Notification;
        Insert: Partial<Notification> & { title: string; body: string };
        Update: Partial<Notification>; Relationships: [];
      };
      notification_reads: {
        Row: NotificationRead;
        Insert: { notification_id: string; user_id: string; read_at?: string };
        Update: Partial<NotificationRead>; Relationships: [];
      };
      support_messages: {
        Row: SupportMessage;
        Insert: Partial<SupportMessage> & { user_id: string; sender: SupportSender };
        Update: Partial<SupportMessage>; Relationships: [];
      };
      conversion_quotes: {
        Row: ConversionQuoteRow;
        Insert: Partial<ConversionQuoteRow> & {
          user_id: string;
          source_currency: Currency;
          target_currency: Currency;
          source_amount: number;
          target_amount: number;
          expires_at: string;
        };
        Update: Partial<ConversionQuoteRow>; Relationships: [];
      };

      // ── 0026 ──────────────────────────────────────────────────────────
      cny_tier_rates: {
        Row: CnyTierRate;
        Insert: Partial<CnyTierRate> & { tier_min_cny: number; tier_max_cny: number; usdt_to_cny_rate: number };
        Update: Partial<CnyTierRate>; Relationships: [];
      };
      cny_markup_rate: {
        Row: CnyMarkupRate;
        Insert: Partial<CnyMarkupRate>;
        Update: Partial<CnyMarkupRate>; Relationships: [];
      };
      supplier_rates: {
        Row: SupplierRate;
        Insert: Partial<SupplierRate> & {
          base_currency: Currency;
          quote_currency: Currency;
          buy_rate: number;
        };
        Update: Partial<SupplierRate>; Relationships: [];
      };
      pay_to_china_recipients: {
        Row: PayToChinaRecipient;
        Insert: Partial<PayToChinaRecipient> & { user_id: string; payout_method: PayoutMethod };
        Update: Partial<PayToChinaRecipient>; Relationships: [];
      };
      saved_pay_to_china_recipients: {
        Row: SavedPayToChinaRecipient;
        Insert: Partial<SavedPayToChinaRecipient> & {
          user_id: string;
          label: string;
          payout_method: PayoutMethod;
        };
        Update: Partial<SavedPayToChinaRecipient>; Relationships: [];
      };
      pay_to_china_quotes: {
        Row: PayToChinaQuoteRow;
        Insert: Partial<PayToChinaQuoteRow> & {
          user_id: string;
          source_currency: Currency;
          source_amount: number;
          target_cny: number;
          expires_at: string;
        };
        Update: Partial<PayToChinaQuoteRow>; Relationships: [];
      };
    };
    Functions: {
      credit_deposit: { Args: { p_deposit_id: string; p_actual_amount?: number | null }; Returns: undefined };
      fail_deposit: { Args: { p_deposit_id: string; p_reason?: string | null }; Returns: undefined };
      /** Migration 0030. Returns whether it actually expired the row — false
       *  when the deadline has not passed, the row is no longer pending, or
       *  money arrived after all. */
      expire_deposit: { Args: { p_deposit_id: string }; Returns: boolean };

      /**
       * Migration 0037 — manual NGN bank-transfer deposits. All five are
       * service-role only, and none of them takes a credited amount from the
       * browser.
       *
       * create_manual_deposit takes the customer's REQUESTED amount, which is
       * the one customer-supplied figure in the flow and credits nothing. It
       * returns the new row's id and its generated JP reference.
       *
       * approve_manual_deposit is the money function: idempotent on the
       * deposit id, only from 'awaiting_review', credits p_received_amount
       * less the configured flat fee, and enforces the >= 1,000,000 NGN
       * second-admin rule itself. Returns 'credited',
       * 'awaiting_second_approval', 'already_credited' or 'not_reviewable'.
       */
      create_manual_deposit: {
        Args: { p_user_id: string; p_amount: number };
        Returns: { deposit_id: string; reference: string }[];
      };
      mark_manual_deposit_sent: {
        Args: { p_user_id: string; p_deposit_id: string; p_screenshot_path?: string | null };
        Returns: boolean;
      };
      approve_manual_deposit: {
        Args: { p_deposit_id: string; p_admin_id: string; p_received_amount: number };
        Returns: string;
      };
      reject_manual_deposit: {
        Args: { p_deposit_id: string; p_admin_id: string; p_reason: string };
        Returns: boolean;
      };
      expire_stale_manual_deposits: { Args: Record<string, never>; Returns: number };

      /**
       * MIGRATION 0040 — virtual-account naira deposits. Both service-role
       * only; neither is callable from a user session.
       *
       * credit_korapay_deposit is idempotent on the provider reference and is
       * the SINGLE path a virtual-account deposit credits by — the webhook
       * and the reconcile cron both call it, so they are two triggers for one
       * code path rather than two code paths that have to agree about money.
       *
       * p_gross_amount must come from a FRESH query of the charge at the
       * provider, never from a webhook body. The function cannot tell the
       * difference; the rule lives at the call site and is asserted in
       * src/app/api/webhooks/korapay/route.test.ts.
       */
      record_virtual_account: {
        Args: {
          p_user_id: string;
          p_currency: Currency;
          p_provider: TransactionProvider;
          p_account_number: string;
          p_bank_name: string;
          p_account_name: string;
          p_provider_reference: string;
        };
        Returns: VirtualAccount;
      };
      credit_korapay_deposit: {
        Args: {
          p_user_id: string;
          p_virtual_account_id: string | null;
          p_provider_reference: string;
          p_currency: Currency;
          p_gross_amount: number;
          p_provider_fee: number;
        };
        /** 'credited' | 'already_credited' | 'below_fee' */
        Returns: string;
      };

      /**
       * Replaces create_conversion (dropped in 0010). Takes an id and a PIN —
       * never an amount or a rate. Every figure on the resulting transaction
       * row is read off the conversion_quotes row the server wrote with the
       * service role. Server-only; see the migration for the attack this
       * closes.
       */
      create_conversion_from_quote: {
        Args: { p_user_id: string; p_quote_id: string; p_pin: string };
        Returns: string;
      };

      /**
       * 0022. The three halves of a conversion, split around the provider call
       * so that every reason to refuse one is evaluated BEFORE the provider is
       * asked to move anything.
       *
       * begin_conversion_hold checks suspension, the PIN, the destination
       * wallet and the balance, then debits the source wallet into a hold row,
       * all in one transaction. It returns the hold id — a server-side
       * capability that never reaches the browser.
       *
       * Then the provider is called. Exactly one of these two follows:
       *
       *   release_conversion_hold            the provider failed; money back.
       *   create_conversion_from_held_quote  the provider succeeded; the
       *                                      ledger row is written from the
       *                                      quote, with no second debit.
       *
       * expire_stale_conversion_holds is the cron's safety net for a hold
       * whose process died before either could run.
       */
      begin_conversion_hold: {
        Args: {
          p_user_id: string;
          p_source_currency: Currency;
          p_target_currency: Currency;
          p_source_amount: number;
          p_pin: string;
        };
        Returns: string;
      };
      release_conversion_hold: {
        Args: { p_hold_id: string; p_user_id?: string | null; p_reason?: string | null };
        Returns: undefined;
      };
      create_conversion_from_held_quote: {
        Args: { p_user_id: string; p_hold_id: string; p_quote_id: string };
        Returns: string;
      };
      expire_stale_conversion_holds: {
        Args: { p_older_than?: string };
        Returns: number;
      };

      complete_conversion: { Args: { p_transaction_id: string }; Returns: undefined };
      flag_transaction_for_review: {
        Args: { p_transaction_id: string; p_reason: string };
        Returns: undefined;
      };
      /**
       * 0024 gave this a redirect: a row whose leg1_target_amount is set had
       * its first leg converted, so refunding the source would pay the user
       * twice. fail_conversion calls partially_complete_conversion instead
       * and the row ends up 'partially_completed', NOT 'failed'. Every caller
       * must re-read the row's status rather than assume the name of the
       * function it called — see convert.readConversionStatus.
       */
      fail_conversion: { Args: { p_transaction_id: string; p_reason?: string | null }; Returns: undefined };

      /**
       * Credits the bridge currency a completed first leg produced and marks
       * the row 'partially_completed'. Takes an id and a reason — the amount
       * is read off the row's own leg1_target_amount, never from a caller.
       * Idempotent, and server-only.
       */
      partially_complete_conversion: {
        Args: { p_transaction_id: string; p_reason?: string | null };
        Returns: undefined;
      };

      /**
       * The exactly-once gate for money-event notifications (0018). Returns
       * true to the FIRST caller for a given row and false to every caller
       * after it, so the several paths that can complete the same transaction
       * or deposit between them send exactly one email and one bell entry.
       * Service-role only. See src/lib/notify/events.ts.
       */
      claim_transaction_notification: { Args: { p_transaction_id: string }; Returns: boolean };
      claim_deposit_notification: { Args: { p_deposit_id: string }; Returns: boolean };

      // ── Phase 4 (0019). All service-role only. ──
      /** The caller's active role, or null. Resolved by requireAdminUser. */
      admin_role_for: { Args: { p_user_id: string }; Returns: AdminRole | null };
      /** The ADMIN_EMAILS bootstrap. No-op once a row exists, including a
       *  REVOKED one — revocation beats a stale env var. */
      admin_bootstrap_role: { Args: { p_user_id: string }; Returns: AdminRole | null };
      admin_grant_role: {
        Args: { p_user_id: string; p_role: AdminRole; p_granted_by: string };
        Returns: undefined;
      };
      admin_revoke_role: { Args: { p_user_id: string; p_revoked_by: string }; Returns: undefined };
      admin_suspend_user: {
        Args: { p_user_id: string; p_reason: string; p_suspended_by: string };
        Returns: undefined;
      };
      admin_unsuspend_user: { Args: { p_user_id: string; p_by: string }; Returns: undefined };
      admin_log_activity: {
        Args: {
          p_admin_id: string;
          p_action: string;
          p_target_type?: string | null;
          p_target_id?: string | null;
          p_detail?: Record<string, unknown> | null;
        };
        Returns: number;
      };
      admin_dashboard_stats: { Args: Record<string, never>; Returns: AdminDashboardStats };
      assert_phase4_invariants: { Args: Record<string, never>; Returns: boolean };

      /**
       * 0026 — CNY and Pay to China. EVERY ONE of these is revoked from
       * public, anon and authenticated, and none takes an amount or a rate:
       * the two that move money (settle_cny_conversion,
       * create_pay_to_china_request) read every figure off a server-written
       * quote row they are given only the id of.
       *
       * That is the whole difference between this and the implementation it
       * was ported from, where the equivalents are authenticated-callable
       * with caller-supplied amounts.
       */
      settle_cny_conversion: {
        Args: { p_user_id: string; p_hold_id: string; p_quote_id: string };
        Returns: string;
      };
      create_pay_to_china_request: {
        Args: { p_user_id: string; p_quote_id: string; p_recipient_id: string; p_pin: string };
        Returns: string;
      };
      admin_start_pay_to_china: {
        Args: { p_transaction_id: string; p_admin_id: string };
        Returns: undefined;
      };
      admin_complete_pay_to_china: {
        Args: {
          p_transaction_id: string;
          p_admin_id: string;
          p_actual_cny: number;
          p_proof_ref?: string | null;
          p_note?: string | null;
        };
        Returns: undefined;
      };
      admin_reject_pay_to_china: {
        Args: { p_transaction_id: string; p_admin_id: string; p_reason: string };
        Returns: undefined;
      };
      admin_set_cny_tier_rate: {
        Args: { p_tier_min: number; p_tier_max: number; p_rate: number; p_admin_id: string };
        Returns: undefined;
      };
      admin_delete_cny_tier_rate: {
        Args: { p_tier_min: number; p_admin_id: string };
        Returns: undefined;
      };
      admin_set_cny_markup_rate: {
        Args: { p_fiat_markup_rate: number; p_usdt_markup_rate: number; p_admin_id: string };
        Returns: undefined;
      };
      admin_set_supplier_rate: {
        Args: {
          p_base_currency: Currency;
          p_quote_currency: Currency;
          p_buy_rate: number;
          p_effective_from: string | null;
          p_admin_id: string;
        };
        Returns: string;
      };

      create_withdrawal_request: {
        Args: { p_currency: Currency; p_amount: number; p_pin: string };
        Returns: string;
      };
      mark_withdrawal_processing: { Args: { p_transaction_id: string; p_provider_reference: string }; Returns: undefined };
      complete_withdrawal_payout: { Args: { p_transaction_id: string }; Returns: undefined };
      fail_withdrawal_payout: { Args: { p_transaction_id: string; p_reason?: string | null }; Returns: undefined };
      flag_withdrawal_for_verification: { Args: { p_transaction_id: string }; Returns: undefined };
      record_automated_payout_failure: { Args: { p_transaction_id: string; p_reason: string }; Returns: undefined };
      rolling_withdrawal_total: { Args: { p_user_id: string; p_hours: number }; Returns: RollingWithdrawalTotalRow[] };

      set_withdrawal_recipient: {
        Args: {
          p_currency: Currency;
          p_account_holder_name: string;
          p_bank_account_number: string | null;
          p_bank_name: string | null;
          p_wallet_address: string | null;
          p_bank_code: string | null;
          p_network: string | null;
        };
        Returns: undefined;
      };
      /**
       * Both recipient-change functions are server-only (0013). Their password
       * re-check can only be done in TS, so they are reachable only from the
       * server action that performs it — not from the session alongside it.
       */
      request_recipient_change_for_user: {
        Args: { p_user_id: string; p_currency: Currency };
        Returns: undefined;
      };
      confirm_recipient_change_for_user: {
        Args: {
          p_user_id: string;
          p_currency: Currency;
          p_account_holder_name: string;
          p_bank_account_number: string | null;
          p_bank_name: string | null;
          p_wallet_address: string | null;
          p_bank_code: string | null;
          p_network: string | null;
        };
        Returns: RecipientChangeResultRow[];
      };
      my_recipient_change_hold_active: { Args: { p_currency: Currency }; Returns: boolean };
      set_busha_recipient_id: {
        Args: { p_user_id: string; p_currency: Currency; p_recipient_id: string };
        Returns: undefined;
      };

      set_withdrawal_pin: { Args: { p_pin: string }; Returns: undefined };
      /** Server-only (0013): the password re-check happens in TS, so this is
       *  reachable only from the action that does it. */
      change_withdrawal_pin_for_user: { Args: { p_user_id: string; p_pin: string }; Returns: undefined };
      /** Replaces the dropped "withdrawal_pins: read own" select policy, which
       *  also exposed pin_hash. auth.uid()-scoped. */
      has_transaction_pin: { Args: Record<string, never>; Returns: boolean };
      /** Server-only. Increments the failed-PIN counter in its own transaction,
       *  after the money function's raise has rolled its own back. */
      record_pin_failure: { Args: { p_user_id: string }; Returns: PinFailureRow[] };

      admin_approve_kyc: { Args: { p_user_id: string }; Returns: undefined };
      admin_reject_kyc: { Args: { p_user_id: string; p_reason: string }; Returns: undefined };
      admin_complete_withdrawal: { Args: { p_transaction_id: string }; Returns: undefined };
      admin_reject_withdrawal: { Args: { p_transaction_id: string; p_reason?: string | null }; Returns: undefined };
      admin_confirm_withdrawal_verification: { Args: { p_transaction_id: string; p_admin_id: string }; Returns: undefined };
      admin_set_rate_markup: {
        Args: {
          p_base_currency: Currency;
          p_quote_currency: Currency;
          p_markup_rate: number;
          p_set_by: string;
        };
        Returns: undefined;
      };
      admin_set_setting: { Args: { p_key: string; p_value: string; p_set_by: string }; Returns: undefined };

      /**
       * Replaces create_bill_payment (dropped in 0010). Note the absence of
       * p_fee: the fee is derived inside the function from app_settings, in the
       * same transaction that debits, so there is no argument a caller could
       * pass to influence it.
       */
      create_bill_payment_for_user: {
        Args: {
          p_user_id: string;
          p_category: BillCategory;
          p_country: string;
          p_biller_code: string;
          p_biller_name: string;
          p_customer_identifier: string;
          p_customer_name: string | null;
          p_amount: number;
          p_currency: Currency;
          p_provider: string;
          p_pin: string;
        };
        Returns: string;
      };
      /** The same arithmetic the debit uses, for the review screen. */
      quote_bill_fee: { Args: { p_amount: number }; Returns: number };
      complete_bill_payment: {
        Args: {
          p_bill_payment_id: string;
          p_provider_reference: string | null;
          p_token: string | null;
          p_units: string | null;
        };
        Returns: undefined;
      };
      refund_bill_payment: { Args: { p_bill_payment_id: string; p_reason: string }; Returns: undefined };

      upsert_usd_collection_account: {
        Args: {
          p_user_id: string;
          p_provider: string;
          p_reference_code: string;
          p_account_name?: string | null;
          p_account_number?: string | null;
          p_routing_number?: string | null;
          p_bank_name?: string | null;
          p_bank_address?: string | null;
          p_account_type?: string | null;
          p_status?: string;
        };
        Returns: string;
      };

      // ── Notifications and support chat (0017) ───────────────────────────
      // The four user-facing ones take no arguments at all: each derives its
      // subject from auth.uid(), so none can be asked about anybody else.
      unread_notification_count: { Args: Record<string, never>; Returns: number };
      mark_all_notifications_read: { Args: Record<string, never>; Returns: undefined };
      unread_support_count: { Args: Record<string, never>; Returns: number };
      mark_support_thread_read: { Args: Record<string, never>; Returns: undefined };
      /** Service-role only. p_user_id null is a broadcast to every user. */
      admin_send_notification: {
        Args: {
          p_user_id: string | null;
          p_title: string;
          p_body: string;
          p_href: string | null;
          /**
           * Nullable, matching the column and the function signature in 0017.
           * Null means a SYSTEM event — a deposit landing, a payout settling —
           * which has no acting admin. Stamping those with whichever admin
           * happened to be in the room would be a false audit trail.
           */
          p_created_by: string | null;
        };
        Returns: string;
      };
      admin_send_support_message: {
        Args: { p_user_id: string; p_body: string | null; p_attachment_ref?: string | null };
        Returns: string;
      };
      admin_mark_support_thread_read: { Args: { p_user_id: string }; Returns: undefined };

      /** Server-only (0011). The ONLY path to kyc_status = 'pending', and it
       *  can reach no other value — approval stays in admin_approve_kyc. */
      submit_kyc_profile: {
        Args: {
          p_user_id: string;
          p_kyc_type: KycType;
          p_full_name?: string | null;
          p_phone?: string | null;
          p_business_name?: string | null;
        };
        Returns: undefined;
      };

      /** Server-only (0020). Stage-one onboarding: writes phone and kyc_type
       *  and deliberately never touches kyc_status — nothing has been
       *  submitted yet. See migration 0020 for why it is not
       *  submit_kyc_profile. */
      save_onboarding_basics: {
        Args: { p_user_id: string; p_kyc_type: KycType; p_phone: string };
        Returns: undefined;
      };
    };
  };
};

export type RollingWithdrawalTotalRow = {
  currency: Currency;
  total: number;
};

/** confirm_recipient_change_for_user's RETURNS TABLE row. Destinations are
 *  already masked by the function — never a full account number. */
export type RecipientChangeResultRow = {
  previous_destination: string | null;
  new_destination: string | null;
  hold_until: string;
};

/** record_pin_failure's RETURNS TABLE row. Column names avoid colliding with
 *  withdrawal_pins' own, which plpgsql would read as ambiguous. */
export type PinFailureRow = {
  attempts_used: number;
  locked_until_at: string | null;
  just_locked: boolean;
};
