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
  created_at: string;
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
  decline_reason: string | null;
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

export type WithdrawalPin = {
  user_id: string;
  created_at: string;
  updated_at: string;
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

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; email: string }; Update: Partial<Profile> };
      wallets: { Row: Wallet; Insert: Partial<Wallet> & { user_id: string; currency: Currency }; Update: Partial<Wallet> };
      kyc_documents: {
        Row: KycDocument;
        Insert: Partial<KycDocument> & { user_id: string; tier: KycTier; document_type: string };
        Update: Partial<KycDocument>;
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
        Update: Partial<Transaction>;
      };
      webhook_events: {
        Row: WebhookEvent;
        Insert: Partial<WebhookEvent> & { provider: string; event_type: string; payload: Record<string, unknown> };
        Update: Partial<WebhookEvent>;
      };
      deposits: {
        Row: Deposit;
        Insert: Partial<Deposit> & {
          user_id: string;
          currency: Currency;
          amount: number;
          provider: TransactionProvider;
        };
        Update: Partial<Deposit>;
      };
      withdrawal_recipients: {
        Row: WithdrawalRecipient;
        Insert: Partial<WithdrawalRecipient> & { user_id: string; currency: Currency; account_holder_name: string };
        Update: Partial<WithdrawalRecipient>;
      };
      withdrawal_pins: { Row: WithdrawalPin; Insert: { user_id: string }; Update: Partial<WithdrawalPin> };
      rate_markups: {
        Row: RateMarkup;
        Insert: Partial<RateMarkup> & { base_currency: Currency; quote_currency: Currency; markup_rate: number };
        Update: Partial<RateMarkup>;
      };
      app_settings: { Row: AppSetting; Insert: Partial<AppSetting> & { key: string; value: string }; Update: Partial<AppSetting> };
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
        Update: Partial<BillPayment>;
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
        Update: Partial<BillBeneficiary>;
      };
      usd_collection_accounts: {
        Row: UsdCollectionAccount;
        Insert: Partial<UsdCollectionAccount> & { user_id: string; provider: string; reference_code: string };
        Update: Partial<UsdCollectionAccount>;
      };
    };
    Functions: {
      credit_deposit: { Args: { p_deposit_id: string; p_actual_amount?: number | null }; Returns: undefined };
      fail_deposit: { Args: { p_deposit_id: string; p_reason?: string | null }; Returns: undefined };

      create_conversion: {
        Args: {
          p_source_currency: Currency;
          p_target_currency: Currency;
          p_source_amount: number;
          p_target_amount: number;
          p_provider_reference: string | null;
          p_provider_rate: number | null;
          p_markup_rate: number | null;
          p_customer_rate: number | null;
          p_raw_target_amount: number | null;
          p_pin: string;
        };
        Returns: string;
      };
      complete_conversion: { Args: { p_transaction_id: string }; Returns: undefined };
      fail_conversion: { Args: { p_transaction_id: string; p_reason?: string | null }; Returns: undefined };

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
      request_recipient_change: { Args: { p_currency: Currency }; Returns: undefined };
      confirm_recipient_change: {
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
      set_withdrawal_pin: { Args: { p_pin: string }; Returns: undefined };
      change_withdrawal_pin: { Args: { p_pin: string }; Returns: undefined };

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

      create_bill_payment: {
        Args: {
          p_category: BillCategory;
          p_country: string;
          p_biller_code: string;
          p_biller_name: string;
          p_customer_identifier: string;
          p_customer_name: string | null;
          p_amount: number;
          p_currency: Currency;
          p_fee: number;
          p_provider: string;
          p_pin: string;
        };
        Returns: string;
      };
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
    };
  };
};

export type RollingWithdrawalTotalRow = {
  currency: Currency;
  total: number;
};
