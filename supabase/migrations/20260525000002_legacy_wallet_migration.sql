-- Legacy Wallet to Ledger Migration

DO $$
DECLARE
    v_escrow_id UUID;
    v_tx_id UUID;
    v_user_id UUID;
    v_balance NUMERIC;
    v_wallet RECORD;
BEGIN
    -- 1. Get the Company Escrow system account ID
    SELECT id INTO v_escrow_id FROM public.system_accounts WHERE name = 'Company Escrow';
    
    IF v_escrow_id IS NULL THEN
        RAISE EXCEPTION 'Company Escrow system account not found';
    END IF;

    -- 2. Loop through all legacy wallets with a positive balance
    FOR v_wallet IN 
        SELECT user_id, balance, currency 
        FROM public.wallets 
        WHERE balance > 0 AND currency = 'NGN'
    LOOP
        -- a. Create a historical transaction record
        INSERT INTO public.transactions (
            user_id, type, amount, fiat_amount, fiat_currency, currency, status, description, reference
        ) VALUES (
            v_wallet.user_id, 
            'deposit', 
            v_wallet.balance, 
            v_wallet.balance, 
            'NGN',
            'NGN',
            'completed', 
            'Legacy Wallet Balance Migration',
            'MIG_' || extract(epoch from now())::bigint || '_' || substr(md5(random()::text), 1, 6)
        )
        RETURNING id INTO v_tx_id;

        -- b. Create Ledger Entry: Credit User Account (Liability)
        INSERT INTO public.ledger_entries (
            transaction_id, account_type, user_id, amount, entry_type
        ) VALUES (
            v_tx_id, 'user', v_wallet.user_id, v_wallet.balance, 'credit'
        );

        -- c. Create Ledger Entry: Debit System Escrow (Asset)
        INSERT INTO public.ledger_entries (
            transaction_id, account_type, system_account_id, amount, entry_type
        ) VALUES (
            v_tx_id, 'system', v_escrow_id, v_wallet.balance, 'debit'
        );
        
        -- d. Zero out the old wallet balance to prevent double counting if scripts accidentally run twice
        UPDATE public.wallets 
        SET balance = 0, updated_at = NOW() 
        WHERE user_id = v_wallet.user_id AND currency = v_wallet.currency;

    END LOOP;
END $$;
