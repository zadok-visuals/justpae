-- 1. Create System Accounts Table
CREATE TABLE IF NOT EXISTS system_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'expense')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initialize Core Accounts
INSERT INTO system_accounts (name, type) VALUES 
('Company Escrow', 'asset'),
('Startup Vault', 'equity'),
('Operating Expenses', 'expense')
ON CONFLICT (name) DO NOTHING;

-- 2. Create Ledger Entries Table
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    account_type TEXT NOT NULL CHECK (account_type IN ('system', 'user')),
    system_account_id UUID REFERENCES system_accounts(id),
    user_id UUID REFERENCES auth.users(id),
    amount NUMERIC NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('debit', 'credit')),
    clears_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (account_type = 'system' AND system_account_id IS NOT NULL AND user_id IS NULL) OR
        (account_type = 'user' AND user_id IS NOT NULL AND system_account_id IS NULL)
    )
);

-- Enable RLS on ledger_entries
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ledger entries"
    ON ledger_entries FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Admins can view all ledger entries"
    ON ledger_entries FOR SELECT
    USING (EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid()));

-- 3. Create Wallet Balances View
CREATE OR REPLACE VIEW wallet_balances_view AS
SELECT 
    user_id,
    COALESCE(SUM(CASE WHEN entry_type = 'credit' AND clears_at <= NOW() THEN amount ELSE 0 END), 0) -
    COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) AS available_balance,
    COALESCE(SUM(CASE WHEN entry_type = 'credit' AND clears_at > NOW() THEN amount ELSE 0 END), 0) AS pending_balance
FROM ledger_entries
WHERE account_type = 'user'
GROUP BY user_id;

-- 4. Re-write request_withdrawal to use ledger
CREATE OR REPLACE FUNCTION request_withdrawal(
  p_user_id UUID,
  p_amount NUMERIC,
  p_bank_account TEXT,
  p_reference TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_available NUMERIC;
  v_tx_id UUID;
  v_escrow_id UUID;
BEGIN
  SELECT id INTO v_escrow_id FROM system_accounts WHERE name = 'Company Escrow';
  SELECT available_balance INTO v_available FROM wallet_balances_view WHERE user_id = p_user_id;
  
  IF v_available IS NULL OR v_available < p_amount THEN
    RAISE EXCEPTION 'Insufficient cleared balance';
  END IF;

  INSERT INTO transactions (user_id, type, amount, fiat_amount, fiat_currency, status, description, reference)
  VALUES (p_user_id, 'withdrawal', -p_amount, p_amount, 'NGN', 'pending', 'Withdrawal to ' || p_bank_account, p_reference)
  RETURNING id INTO v_tx_id;

  INSERT INTO ledger_entries (transaction_id, account_type, user_id, amount, entry_type)
  VALUES (v_tx_id, 'user', p_user_id, p_amount, 'debit');

  INSERT INTO ledger_entries (transaction_id, account_type, system_account_id, amount, entry_type)
  VALUES (v_tx_id, 'system', v_escrow_id, p_amount, 'credit');

  RETURN TRUE;
END;
$$;

-- 5. Re-write admin_confirm_trade to use ledger
CREATE OR REPLACE FUNCTION admin_confirm_trade(
  p_user_id UUID,
  p_type TEXT, -- 'buy', 'sell', 'withdrawal', 'deposit', or 'gift_card'
  p_fiat_amount NUMERIC,
  p_crypto_amount NUMERIC DEFAULT 0,
  p_crypto_symbol TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id UUID;
  v_escrow_id UUID;
  v_vault_id UUID;
  v_clears_at TIMESTAMPTZ := NOW();
BEGIN
  SELECT id INTO v_escrow_id FROM system_accounts WHERE name = 'Company Escrow';
  SELECT id INTO v_vault_id FROM system_accounts WHERE name = 'Startup Vault';

  -- Gift Card Liquidity Guard (30 minute clearance)
  IF p_type = 'gift_card' THEN
    v_clears_at := NOW() + INTERVAL '30 minutes';
  END IF;

  -- Create transaction record if not found (simplified to always create one for simplicity in this rewrite)
  INSERT INTO transactions (user_id, type, asset, amount, fiat_amount, fiat_currency, status, description)
  VALUES (p_user_id, p_type, p_crypto_symbol, p_crypto_amount, p_fiat_amount, 'NGN', 'completed', 'Admin confirmed ' || p_type)
  RETURNING id INTO v_tx_id;

  -- Ledger Entries
  IF p_type = 'sell' OR p_type = 'deposit' OR p_type = 'gift_card' THEN
    -- Credit User Liability
    INSERT INTO ledger_entries (transaction_id, account_type, user_id, amount, entry_type, clears_at)
    VALUES (v_tx_id, 'user', p_user_id, p_fiat_amount, 'credit', v_clears_at);
    
    -- Debit Company Escrow (Asset) or Vault (Equity) depending on source
    -- For gift cards, funds come from Startup Vault/Equity technically before liquidation
    IF p_type = 'gift_card' THEN
        INSERT INTO ledger_entries (transaction_id, account_type, system_account_id, amount, entry_type)
        VALUES (v_tx_id, 'system', v_vault_id, p_fiat_amount, 'debit');
    ELSE
        INSERT INTO ledger_entries (transaction_id, account_type, system_account_id, amount, entry_type)
        VALUES (v_tx_id, 'system', v_escrow_id, p_fiat_amount, 'debit');
    END IF;

  ELSIF p_type = 'buy' THEN
    -- Debit User Liability
    INSERT INTO ledger_entries (transaction_id, account_type, user_id, amount, entry_type)
    VALUES (v_tx_id, 'user', p_user_id, p_fiat_amount, 'debit');
    
    -- Credit Startup Vault (Equity/Revenue)
    INSERT INTO ledger_entries (transaction_id, account_type, system_account_id, amount, entry_type)
    VALUES (v_tx_id, 'system', v_vault_id, p_fiat_amount, 'credit');
  END IF;

  -- Note: p_type = 'withdrawal' is skipped here because it's handled by request_withdrawal. 
  -- If admin confirms a pending withdrawal, it shouldn't deduct balance again. 

  RETURN TRUE;
END;
$$;
