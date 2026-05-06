
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CryptoDeposit {
  id: string;
  user_id: string;
  crypto_id: string;
  wallet_address_id: string;
  transaction_hash?: string;
  crypto_amount: number;
  fiat_currency: string;
  fiat_amount: number;
  exchange_rate: number;
  fee_amount: number;
  net_fiat_amount: number;
  status: string;
  confirmations: number;
  required_confirmations: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get pending crypto deposits
    const { data: pendingDeposits, error: fetchError } = await supabaseClient
      .from('crypto_deposits')
      .select(`
        *,
        crypto_wallet_addresses!inner(address),
        supported_cryptos!inner(symbol, network)
      `)
      .in('status', ['pending', 'confirming'])

    if (fetchError) {
      console.error('Error fetching pending deposits:', fetchError)
      throw fetchError
    }

    console.log(`Found ${pendingDeposits?.length || 0} pending deposits to monitor`)

    const results = []

    for (const deposit of pendingDeposits || []) {
      try {
        // Mock blockchain monitoring - in production, use real blockchain APIs
        const mockTransaction = await checkBlockchainTransaction(
          deposit.crypto_wallet_addresses.address,
          deposit.supported_cryptos.symbol,
          deposit.supported_cryptos.network
        )

        if (mockTransaction.found) {
          console.log(`Transaction found for deposit ${deposit.id}`)
          
          let newStatus = deposit.status
          let confirmations = mockTransaction.confirmations

          // Update status based on confirmations
          if (confirmations >= deposit.required_confirmations) {
            newStatus = 'confirmed'
            
            // Credit user's fiat wallet
            await creditUserWallet(supabaseClient, deposit)
            
            console.log(`Deposit ${deposit.id} confirmed and credited`)
          } else if (confirmations > 0) {
            newStatus = 'confirming'
          }

          // Update deposit record
          const { error: updateError } = await supabaseClient
            .from('crypto_deposits')
            .update({
              status: newStatus,
              confirmations: confirmations,
              transaction_hash: mockTransaction.hash,
              from_address: mockTransaction.from_address,
              blockchain_status: mockTransaction.status,
              updated_at: new Date().toISOString()
            })
            .eq('id', deposit.id)

          if (updateError) {
            console.error(`Error updating deposit ${deposit.id}:`, updateError)
          } else {
            results.push({
              deposit_id: deposit.id,
              status: newStatus,
              confirmations: confirmations,
              updated: true
            })
          }
        }
      } catch (error) {
        console.error(`Error processing deposit ${deposit.id}:`, error)
        results.push({
          deposit_id: deposit.id,
          error: error.message,
          updated: false
        })
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        results: results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    console.error('Error in monitor-crypto-deposits:', error)
    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

async function checkBlockchainTransaction(address: string, symbol: string, network: string) {
  // Mock implementation - in production, use real blockchain APIs like:
  // - Blockchair API for Bitcoin
  // - Etherscan API for Ethereum
  // - Web3 providers for real-time monitoring
  
  console.log(`Checking ${symbol} transactions for address: ${address}`)
  
  // Simulate finding a transaction after some time
  const mockFound = Math.random() > 0.7 // 30% chance of finding transaction
  
  if (mockFound) {
    return {
      found: true,
      hash: `0x${Math.random().toString(16).substring(2, 66)}`,
      from_address: generateMockAddress(symbol),
      confirmations: Math.floor(Math.random() * 10) + 1,
      status: 'confirmed',
      amount: Math.random() * 10
    }
  }
  
  return {
    found: false,
    confirmations: 0
  }
}

async function creditUserWallet(supabaseClient: any, deposit: CryptoDeposit) {
  try {
    // Get user's fiat wallet
    const { data: wallet, error: walletError } = await supabaseClient
      .from('wallets')
      .select('*')
      .eq('user_id', deposit.user_id)
      .eq('currency', deposit.fiat_currency)
      .single()

    if (walletError) {
      console.error('Error fetching user wallet:', walletError)
      throw walletError
    }

    // Update wallet balance
    const newBalance = parseFloat(wallet.balance) + deposit.net_fiat_amount
    
    const { error: updateError } = await supabaseClient
      .from('wallets')
      .update({
        balance: newBalance,
        updated_at: new Date().toISOString()
      })
      .eq('id', wallet.id)

    if (updateError) {
      console.error('Error updating wallet balance:', updateError)
      throw updateError
    }

    // Create transaction record
    const { error: transactionError } = await supabaseClient
      .from('transactions')
      .insert({
        user_id: deposit.user_id,
        type: 'deposit',
        asset: 'crypto',
        amount: deposit.net_fiat_amount,
        fiat_amount: deposit.net_fiat_amount,
        fiat_currency: deposit.fiat_currency,
        status: 'completed',
        description: `Crypto deposit conversion from crypto to ${deposit.fiat_currency}`,
        reference: `CRYPTO_DEP_${deposit.id}`,
        metadata: {
          crypto_deposit_id: deposit.id,
          original_crypto_amount: deposit.crypto_amount,
          exchange_rate: deposit.exchange_rate,
          fee_amount: deposit.fee_amount
        }
      })

    if (transactionError) {
      console.error('Error creating transaction record:', transactionError)
      throw transactionError
    }

    console.log(`Successfully credited ${deposit.net_fiat_amount} ${deposit.fiat_currency} to user ${deposit.user_id}`)
    
  } catch (error) {
    console.error('Error crediting user wallet:', error)
    throw error
  }
}

function generateMockAddress(symbol: string): string {
  const random = Math.random().toString(36).substring(2, 15)
  
  if (symbol === 'BTC') {
    return `bc1q${random}12345678`
  } else if (symbol === 'ETH' || symbol === 'USDT' || symbol === 'USDC') {
    return `0x${random}1234567890abcdef`.substring(0, 42)
  }
  
  return `${symbol.toLowerCase()}_${random}`
}
