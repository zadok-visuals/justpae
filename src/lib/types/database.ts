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
 * To add a currency later (CNY is the obvious candidate): add the value to the
 * Postgres enum in its own migration, then add one entry to CURRENCIES in
 * src/lib/currencies.ts. Nothing else in the app hardcodes the list.
 */
export type Currency = "USD" | "NGN" | "GHS" | "KES" | "USDT";

/**
 * Free-form ISO 3166-1 alpha-2, not a fixed enum — a user's real country is
 * stored as-is even when no local wallet exists for it. Only the codes in
 * LOCAL_WALLET_COUNTRIES (src/lib/countries.ts) get one provisioned.
 */
export type CountryCode = string;

export type TransactionType = "convert" | "withdrawal";
export type TransactionProvider = "busha" | "klasha" | "manual";
export type TransactionStatus = "pending" | "processing" | "completed" | "failed";

export type BillCategory = "airtime" | "data" | "electricity" | "water" | "cable_tv";
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
  /** When the user was told this transaction reached a terminal state. The
   *  exactly-once marker from 0018 — completed and failed are mutually
   *  exclusive, so one stamp per row covers both. */
  notified_at: string | null;
  created_at: string;
};

export type WebhookEvent = {
  id: string;
  provider: string;
  event_type: string;
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
 * Two things in this type exist purely to satisfy @supabase/postgrest-js's
 * `GenericSchema` constraint, and both are load-bearing rather than
 * decoration — getting either wrong produces errors that look like the
 * database is wrong rather than the type:
 *
 *  - `Views`. If the schema does not structurally match `GenericSchema`, the
 *    client silently falls back to an untyped schema: every `.rpc()` call's
 *    args parameter resolves to `undefined` ("Argument of type {...} is not
 *    assignable to parameter of type 'undefined'") and every narrowed select
 *    resolves to `never`. There are no views, hence the empty mapped type.
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
    Views: { [_ in never]: never };
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
    };
    Functions: {
      credit_deposit: { Args: { p_deposit_id: string; p_actual_amount?: number | null }; Returns: undefined };
      fail_deposit: { Args: { p_deposit_id: string; p_reason?: string | null }; Returns: undefined };

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
      complete_conversion: { Args: { p_transaction_id: string }; Returns: undefined };
      flag_transaction_for_review: {
        Args: { p_transaction_id: string; p_reason: string };
        Returns: undefined;
      };
      fail_conversion: { Args: { p_transaction_id: string; p_reason?: string | null }; Returns: undefined };

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
