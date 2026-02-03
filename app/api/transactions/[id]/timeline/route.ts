/**
 * Transaction Timeline Endpoint
 *
 * Per PRD Section 10 - GET /api/transactions/[id]/timeline
 * Returns chronological event history for a transaction
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

interface TimelineEvent {
  timestamp: string
  event_type: string
  description: string
  actor?: string
  tx_hash?: string
  metadata?: Record<string, unknown>
}

// GET /api/transactions/[id]/timeline - Get transaction timeline
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Get transaction with all details
  const { data: transaction } = await supabaseAdmin
    .from('transactions')
    .select(`
      *,
      buyer:agents!buyer_agent_id(id, name, owner_address),
      seller:agents!seller_agent_id(id, name, owner_address),
      listing:listings(id, title)
    `)
    .eq('id', id)
    .single()

  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buyer = transaction.buyer as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seller = transaction.seller as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const listing = transaction.listing as any

  // Verify party ownership or admin
  let hasAccess = false
  const adminWallets = (process.env.ADMIN_WALLETS || '').toLowerCase().split(',')

  if (auth.type === 'user') {
    if (buyer?.owner_address === auth.wallet.toLowerCase() ||
        seller?.owner_address === auth.wallet.toLowerCase() ||
        adminWallets.includes(auth.wallet.toLowerCase())) {
      hasAccess = true
    }
  } else if (auth.type === 'agent') {
    if (auth.agentId === buyer?.id || auth.agentId === seller?.id) {
      hasAccess = true
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Build timeline from transaction data
  const timeline: TimelineEvent[] = []

  // Created
  if (transaction.created_at) {
    timeline.push({
      timestamp: transaction.created_at,
      event_type: 'CREATED',
      description: `Transaction created for "${listing?.title || 'listing'}"`,
      actor: buyer?.name,
    })
  }

  // Funded (escrow created on-chain)
  if (transaction.escrow_tx_hash) {
    timeline.push({
      timestamp: transaction.funded_at || transaction.created_at,
      event_type: 'FUNDED',
      description: 'Escrow funded on-chain',
      actor: buyer?.name,
      tx_hash: transaction.escrow_tx_hash,
      metadata: {
        contract_version: transaction.contract_version,
        escrow_id: transaction.escrow_id,
      },
    })
  }

  // Delivered
  if (transaction.delivered_at) {
    timeline.push({
      timestamp: transaction.delivered_at,
      event_type: 'DELIVERED',
      description: 'Service marked as delivered',
      actor: seller?.name,
      tx_hash: transaction.delivery_tx_hash,
      metadata: {
        deliverable_hash: transaction.deliverable_hash,
        dispute_window_hours: transaction.dispute_window_hours,
      },
    })
  }

  // Disputed
  if (transaction.disputed_at) {
    timeline.push({
      timestamp: transaction.disputed_at,
      event_type: 'DISPUTED',
      description: transaction.dispute_reason
        ? `Dispute filed: ${transaction.dispute_reason.slice(0, 100)}`
        : 'Dispute filed',
      actor: buyer?.name,
      tx_hash: transaction.dispute_tx_hash,
    })
  }

  // Evidence (if any)
  const evidence = transaction.dispute_evidence || []
  for (const ev of evidence) {
    timeline.push({
      timestamp: ev.created_at,
      event_type: 'EVIDENCE_ADDED',
      description: `Evidence submitted by ${ev.submitted_by}`,
      actor: ev.agent_name,
      metadata: {
        evidence_type: ev.evidence_type,
      },
    })
  }

  // Resolved/Released/Refunded
  if (transaction.state === 'RELEASED' && transaction.completed_at) {
    timeline.push({
      timestamp: transaction.completed_at,
      event_type: 'RELEASED',
      description: transaction.disputed
        ? 'Dispute resolved in favor of seller - funds released'
        : 'Funds released to seller',
      tx_hash: transaction.release_tx_hash,
      metadata: {
        auto_release: !transaction.disputed && !transaction.early_release,
      },
    })
  }

  if (transaction.state === 'REFUNDED' && transaction.completed_at) {
    timeline.push({
      timestamp: transaction.completed_at,
      event_type: 'REFUNDED',
      description: transaction.disputed
        ? 'Dispute resolved in favor of buyer - funds refunded'
        : 'Funds refunded to buyer',
      tx_hash: transaction.refund_tx_hash,
    })
  }

  // Reconciled (if applicable)
  if (transaction.reconciled_at) {
    timeline.push({
      timestamp: transaction.reconciled_at,
      event_type: 'RECONCILED',
      description: 'State reconciled with on-chain data',
      metadata: {
        notes: transaction.notes,
      },
    })
  }

  // Sort by timestamp
  timeline.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  return NextResponse.json({
    transaction_id: id,
    current_state: transaction.state,
    timeline,
    summary: {
      total_events: timeline.length,
      started_at: timeline[0]?.timestamp,
      last_activity: timeline[timeline.length - 1]?.timestamp,
      on_chain_events: timeline.filter(e => e.tx_hash).length,
    },
  })
}
