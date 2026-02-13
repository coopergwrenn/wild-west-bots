/**
 * Admin Manual Oracle Release Endpoint
 *
 * Per PRD Section 10 - POST /api/admin/oracle/release/[id]
 * Allows admin to manually trigger oracle release for a transaction
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { executeRelease } from '@/lib/oracle/release'
import { sendAlert } from '@/lib/monitoring/alerts'
import { notifyPaymentReceived } from '@/lib/notifications/create'
import { fireAgentWebhook } from '@/lib/webhooks/send-webhook'

// POST /api/admin/oracle/release/[id] - Manual oracle release
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
        error: 'Manual release only supported for V2 transactions'
      }, { status: 400 })
    }

    // Must have escrow_id
    if (!transaction.escrow_id) {
      return NextResponse.json({ error: 'Transaction has no escrow_id' }, { status: 400 })
    }

    // Check state
    if (transaction.state === 'RELEASED') {
      return NextResponse.json({
        error: 'Transaction already released',
        release_tx_hash: transaction.release_tx_hash,
      }, { status: 400 })
    }

    if (transaction.state === 'REFUNDED') {
      return NextResponse.json({ error: 'Transaction already refunded' }, { status: 400 })
    }

    // Execute release
    const result = await executeRelease(transaction.escrow_id)

    if (!result.success) {
      await sendAlert('error', `Manual oracle release failed for ${id}`, {
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
    const { error: updateError } = await supabaseAdmin
      .from('transactions')
      .update({
        state: 'RELEASED',
        release_tx_hash: result.txHash,
        completed_at: new Date().toISOString(),
        notes: `Manual release by admin ${adminWallet || 'cron'}`,
      })
      .eq('id', id)

    if (updateError) {
      console.error('Failed to update transaction after on-chain release:', updateError)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buyer = transaction.buyer as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seller = transaction.seller as any

    // Notify seller that payment was received
    if (transaction.seller_agent_id) {
      const amountWei = BigInt(transaction.amount_wei || transaction.price_wei || '0');
      const sellerAmount = (amountWei * BigInt(9900) / BigInt(10000)).toString();
      notifyPaymentReceived(
        transaction.seller_agent_id,
        buyer?.name || 'Buyer',
        transaction.listing_title || 'Transaction',
        sellerAmount,
        id
      ).catch(() => {});

      fireAgentWebhook(transaction.seller_agent_id, 'bounty_completed', {
        event: 'bounty_completed',
        transaction_id: id,
        bounty_title: transaction.listing_title || 'Transaction',
        amount_earned: sellerAmount,
        tx_hash: result.txHash,
        buyer_name: buyer?.name || 'Buyer',
        bounty_url: transaction.listing_id
          ? `https://clawlancer.ai/marketplace/${transaction.listing_id}`
          : 'https://clawlancer.ai/marketplace',
      }).catch(() => {});
    }

    // Log alert
    await sendAlert('info', `Manual oracle release executed for ${id}`, {
      transaction_id: id,
      escrow_id: transaction.escrow_id,
      tx_hash: result.txHash,
      admin: adminWallet || 'cron',
      buyer: buyer?.name,
      seller: seller?.name,
    })

    return NextResponse.json({
      success: true,
      transaction_id: id,
      tx_hash: result.txHash,
      already_released: result.alreadyReleased,
      message: result.alreadyReleased
        ? 'Transaction was already released on-chain'
        : 'Successfully released funds to seller',
    })
  } catch (err) {
    console.error('Manual release error:', err)
    return NextResponse.json({
      error: 'Internal error',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 })
  }
}
