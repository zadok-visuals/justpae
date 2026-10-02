# Migrations

A **consolidated** set for a **fresh** Supabase project. This is not a replay of
the 35 incremental migrations the server-side architecture this app is built on
arrived at — it is the final schema those migrations produce, minus everything
RMB/CNY, plus this product's own additions (first-class USD wallets, rate
markups, operator-tunable settings, bill payments, USD collection).

Do not point these at the pre-rebuild justpae Supabase project. They assume an
empty `public` schema and will collide with anything already there.

## Applying them

```bash
# 1. Install the CLI if it isn't already (one of these).
brew install supabase/tap/supabase
# or: npm i -g supabase

# 2. Log in. Opens a browser for an access token.
supabase login

# 3. Link this repo to the NEW project. The ref is the string in the project's
#    dashboard URL: https://supabase.com/dashboard/project/<project-ref>
#    You are prompted for the database password set when the project was created.
supabase link --project-ref <project-ref>

# 4. Dry run first — prints the files that would be applied, changes nothing.
supabase db push --dry-run

# 5. Apply.
supabase db push
```

`db push` applies the files in filename order inside one transaction per file,
and records each in `supabase_migrations.schema_migrations`, so a second run is
a no-op rather than a re-apply.

## Order, and why it matters

| File | Contents |
| --- | --- |
| `0001_init.sql` | Enums, `profiles`, `wallets`, `kyc_documents`, `transactions`, `deposits`, `webhook_events`, the signup trigger, RLS, the private KYC storage bucket |
| `0002_settings_and_rate_markups.sql` | `app_settings` (+ seeds), `rate_markups` (+ seeds), their admin setters |
| `0003_transaction_pin.sql` | `withdrawal_pins`, set/change, and the shared `verify_transaction_pin` the later money functions call |
| `0004_deposit_functions.sql` | `credit_deposit`, `fail_deposit` |
| `0005_conversions.sql` | `create_conversion` (+ rate audit trail), `complete_conversion`, `fail_conversion` |
| `0006_withdrawals.sql` | `withdrawal_recipients`, `create_withdrawal_request`, `rolling_withdrawal_total`, the automated-payout system RPCs, the admin queue |
| `0007_admin_kyc.sql` | `admin_approve_kyc`, `admin_reject_kyc` |
| `0008_bills.sql` | `bill_payments`, `bill_beneficiaries`, create/complete/refund |
| `0009_usd_collection.sql` | `usd_collection_accounts`, upsert |

0003 must precede 0005, 0006 and 0008 — all three call
`verify_transaction_pin`. 0002 must precede 0006, which reads
`withdrawal_fee_rate` from `app_settings`.

## Adding a currency later

CNY is the obvious next one. It takes exactly two steps and no code changes
beyond them:

1. A new migration containing only `alter type currency add value 'CNY';`. It
   must be its own file: Postgres forbids using a newly added enum value in the
   same transaction that added it, and `db push` runs each file in one
   transaction.
2. One entry in `CURRENCIES` in `src/lib/currencies.ts`.

Every selector, wallet grid, rate strip, route table and formatter reads from
that module. Nothing else enumerates currencies.

## Email templates

Auth emails are **not** synced from this repo by the CLI — Supabase has no
mechanism for it. See `supabase/email-templates/README.md`.

## What is deliberately absent

* **Admin roles.** Admin is an email allowlist (`ADMIN_EMAILS`) checked in
  `src/lib/auth/admin.ts`, not a database role. Every `admin_*` function is
  revoked from `anon` and `authenticated` and reached only through the
  service-role client from an already-gated server action.
* **Any `update wallets set balance = ...` outside a function.** Every balance
  change in this schema happens inside a `security definer` function that locks
  the wallet row first. There is no RLS policy that lets a session write a
  balance at all.
