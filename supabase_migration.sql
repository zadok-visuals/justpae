-- Run this script in your Supabase SQL Editor

CREATE OR REPLACE FUNCTION admin_confirm_trade(
  p_user_id UUID,
  p_type TEXT, -- 'buy', 'sell', or 'deposit'
  p_fiat_amount NUMERIC,
  p_crypto_amount NUMERIC DEFAULT 0,
  p_crypto_symbol TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_transaction_id UUID;
BEGIN
  -- 1. Find or create Naira wallet
  SELECT id INTO v_wallet_id FROM wallets WHERE user_id = p_user_id AND currency = 'NGN';
  IF v_wallet_id IS NULL THEN
    INSERT INTO wallets (user_id, currency, balance) VALUES (p_user_id, 'NGN', 0) RETURNING id INTO v_wallet_id;
  END IF;

  -- 2. Update wallet balance
  IF p_type = 'sell' OR p_type = 'deposit' THEN
    -- User gets Naira
    UPDATE wallets SET balance = balance + p_fiat_amount, updated_at = NOW() WHERE id = v_wallet_id;
  ELSIF p_type = 'buy' THEN
    -- User pays Naira
    UPDATE wallets SET balance = balance - p_fiat_amount, updated_at = NOW() WHERE id = v_wallet_id;
  END IF;

  -- 3. Update crypto holdings (only for buy/sell)
  IF p_type = 'sell' THEN
    UPDATE crypto_holdings SET amount = GREATEST(0, amount - p_crypto_amount), updated_at = NOW() WHERE user_id = p_user_id AND symbol = p_crypto_symbol;
  ELSIF p_type = 'buy' THEN
    IF EXISTS (SELECT 1 FROM crypto_holdings WHERE user_id = p_user_id AND symbol = p_crypto_symbol) THEN
      UPDATE crypto_holdings SET amount = amount + p_crypto_amount, updated_at = NOW() WHERE user_id = p_user_id AND symbol = p_crypto_symbol;
    ELSE
      INSERT INTO crypto_holdings (user_id, symbol, name, amount) VALUES (p_user_id, p_crypto_symbol, p_crypto_symbol, p_crypto_amount);
    END IF;
  END IF;

  -- 4. Find the most recent pending transaction and update it
  IF p_type IN ('buy', 'sell') THEN
    SELECT id INTO v_transaction_id FROM transactions 
    WHERE user_id = p_user_id AND type = p_type AND status = 'pending' AND asset = p_crypto_symbol
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    SELECT id INTO v_transaction_id FROM transactions 
    WHERE user_id = p_user_id AND type = p_type AND status = 'pending' AND fiat_amount = p_fiat_amount
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF v_transaction_id IS NOT NULL THEN
    UPDATE transactions SET status = 'completed', updated_at = NOW() WHERE id = v_transaction_id;
  ELSE
    INSERT INTO transactions (user_id, type, asset, amount, fiat_amount, fiat_currency, status, description)
    VALUES (p_user_id, p_type, p_crypto_symbol, p_crypto_amount, p_fiat_amount, 'NGN', 'completed', 'Admin confirmed ' || p_type);
  END IF;

  RETURN TRUE;
END;
$$;
