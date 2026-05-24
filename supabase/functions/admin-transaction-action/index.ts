import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Create a client that bypasses RLS
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify caller is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      throw new Error('Unauthorized')
    }

    // Check if the user is an admin
    const { data: isAdmin, error: adminCheckError } = await supabase.rpc('is_admin_safe', { user_uuid: user.id })
    if (adminCheckError || !isAdmin) {
      throw new Error('Unauthorized: Not an admin')
    }

    // Get admin user ID for reviewed_by
    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const { transactionId, action, adminNotes } = await req.json()

    if (!transactionId || !action) {
      throw new Error('Missing transactionId or action')
    }

    const newStatus = action === 'approve' ? 'completed' : 'failed'

    // Fetch transaction to get amount, type, and user_id securely
    const { data: tx, error: fetchTxError } = await supabase
      .from('transactions')
      .select('user_id, type, amount, status')
      .eq('id', transactionId)
      .single()

    if (fetchTxError || !tx) {
      throw new Error('Transaction not found')
    }

    // Prevent double-processing
    if (tx.status !== 'pending') {
      throw new Error('Transaction is not in pending status')
    }

    // 1. Update transaction atomically
    const { data: updatedTx, error: updateError } = await supabase
      .from('transactions')
      .update({
        status: newStatus,
        admin_notes: adminNotes,
        reviewed_by: adminUser?.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', transactionId)
      .eq('status', 'pending')
      .select()

    if (updateError || !updatedTx || updatedTx.length === 0) {
      throw new Error('Failed to update transaction status')
    }

    // 2. Safely Update Ledger Entries
    const { data: escrow } = await supabase
      .from('system_accounts')
      .select('id')
      .eq('name', 'Company Escrow')
      .single()

    if (escrow) {
      if (action === 'approve' && tx.type === 'deposit') {
        // Approve Deposit: Credit User, Debit Escrow
        await supabase.from('ledger_entries').insert([
          {
            transaction_id: transactionId,
            account_type: 'system',
            system_account_id: escrow.id,
            amount: Math.abs(tx.amount),
            entry_type: 'debit'
          },
          {
            transaction_id: transactionId,
            account_type: 'user',
            user_id: tx.user_id,
            amount: Math.abs(tx.amount),
            entry_type: 'credit'
          }
        ])
      } else if (action === 'reject' && tx.type === 'withdrawal') {
        // Reject Withdrawal: Refund the user (Credit User, Debit Escrow)
        // Note: A requested withdrawal was already debited from the user by request_withdrawal.
        // Rejecting it puts the money back.
        await supabase.from('ledger_entries').insert([
          {
            transaction_id: transactionId,
            account_type: 'system',
            system_account_id: escrow.id,
            amount: Math.abs(tx.amount),
            entry_type: 'debit'
          },
          {
            transaction_id: transactionId,
            account_type: 'user',
            user_id: tx.user_id,
            amount: Math.abs(tx.amount),
            entry_type: 'credit'
          }
        ])
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error('Error in admin-transaction-action:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
