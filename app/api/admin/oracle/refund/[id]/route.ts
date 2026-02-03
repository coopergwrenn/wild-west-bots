/**
 * Admin Manual Oracle Refund Endpoint
 *
 * Per PRD Section 10 - POST /api/admin/oracle/refund/[id]
 * Allows admin to manually trigger oracle refund for a transaction
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { executeRefund } from '@/lib/oracle/refund'
import { sendAlert } from '@/lib/monitoring/alerts'

// POST /api/admin/oracle/refund/[id] - Manual oracle refund
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Verify admin auth
  const adminWallet = request.headers.get('x-admin-wallet')?.toLowerCase()
  const authHeader = request.headers.get('authorization')
  const adminWallets = (process.env.ADMIN_WALLETS || '').toLowerCase().split(',')

  const isAdmin = adminWallet && adminWallets.includes(adminWallet)
  const isCronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isAdmin && !isCronAuth) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const { reason } = body

    // Get transaction
    const { data: transaction } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        buyer:agents!buyer_agent_id(name),
        seller:agents!seller_agent_id(name)
      `)
      .eq('id', id)
      .single()

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Must be V2 transaction
    if (transaction.contract_version !== 2) {
      return NextResponse.json({
        error: 'Manual refund only supported for V2 transactions'
      }, { status: 400 })
    }

    // Must have escrow_id
    if (!transaction.escrow_id) {
      return NextResponse.json({ error: 'Transaction has no escrow_id' }, { status: 400 })
    }

    // Check state
    if (transaction.state === 'REFUNDED') {
      return NextResponse.json({
        error: 'Transaction already refunded',
        refund_tx_hash: transaction.refund_tx_hash,
      }, { status: 400 })
    }

    if (transaction.state === 'RELEASED') {
      return NextResponse.json({ error: 'Transaction already released' }, { status: 400 })
    }

    // Execute refund
    const result = await executeRefund(transaction.escrow_id)

    if (!result.success) {
      await sendAlert('error', `Manual oracle refund failed for ${id}`, {
        transaction_id: id,
        escrow_id: transaction.escrow_id,
        error: result.error,
        admin: adminWallet || 'cron',
      })

      return NextResponse.json({
        success: false,
        error: result.error,
      }, { status: 500 })
    }

    // Update transaction
    await supabaseAdmin
      .from('transactions')
      .update({
        state: 'REFUNDED',
        refund_tx_hash: result.txHash,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: `Manual refund by admin ${adminWallet || 'cron'}${reason ? `: ${reason}` : ''}`,
      })
      .eq('id', id)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buyer = transaction.buyer as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seller = transaction.seller as any

    // Log alert
    await sendAlert('info', `Manual oracle refund executed for ${id}`, {
      transaction_id: id,
      escrow_id: transaction.escrow_id,
      tx_hash: result.txHash,
      admin: adminWallet || 'cron',
      buyer: buyer?.name,
      seller: seller?.name,
      reason,
    })

    return NextResponse.json({
      success: true,
      transaction_id: id,
      tx_hash: result.txHash,
      already_refunded: result.alreadyRefunded,
      message: result.alreadyRefunded
        ? 'Transaction was already refunded on-chain'
        : 'Successfully refunded funds to buyer',
    })
  } catch (err) {
    console.error('Manual refund error:', err)
    return NextResponse.json({
      error: 'Internal error',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
