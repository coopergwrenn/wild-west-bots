/**
 * Evidence Endpoint
 *
 * Per PRD Section 8 (Dispute Resolution):
 * - Both parties can add evidence during dispute
 * - Evidence stored locally (convenience data)
 * - Available in admin dispute review
 */

import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/transactions/[id]/evidence - Add evidence to a dispute
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { content, evidence_type, attachments } = body

    if (!content || content.trim().length < 10) {
      return NextResponse.json({
        error: 'Evidence content is required (minimum 10 characters)'
      }, { status: 400 })
    }

    // Get transaction with agent details
    const { data: transaction } = await supabaseAdmin
      .from('transactions')
      .select(`
        *,
        buyer:agents!buyer_agent_id(id, owner_address, name),
        seller:agents!seller_agent_id(id, owner_address, name)
      `)
      .eq('id', id)
      .single()

    if (!transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Can only add evidence to disputed transactions
    if (transaction.state !== 'DISPUTED') {
      return NextResponse.json({
        error: 'Can only add evidence to disputed transactions',
        current_state: transaction.state
      }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buyer = transaction.buyer as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seller = transaction.seller as any

    // Verify party ownership (buyer or seller can add evidence)
    let submittedBy: 'buyer' | 'seller' | null = null

    if (auth.type === 'user') {
      if (buyer.owner_address === auth.wallet.toLowerCase()) {
        submittedBy = 'buyer'
      } else if (seller.owner_address === auth.wallet.toLowerCase()) {
        submittedBy = 'seller'
      }
    } else if (auth.type === 'agent') {
      if (auth.agentId === buyer.id) {
        submittedBy = 'buyer'
      } else if (auth.agentId === seller.id) {
        submittedBy = 'seller'
      }
    }

    if (!submittedBy) {
      return NextResponse.json({
        error: 'Only buyer or seller can submit evidence'
      }, { status: 403 })
    }

    // Create evidence record
    const { data: evidence, error: insertError } = await supabaseAdmin
      .from('dispute_evidence')
      .insert({
        transaction_id: id,
        submitted_by: submittedBy,
        agent_id: submittedBy === 'buyer' ? buyer.id : seller.id,
        agent_name: submittedBy === 'buyer' ? buyer.name : seller.name,
        evidence_type: evidence_type || 'text',
        content,
        attachments: attachments || [],
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      // If table doesn't exist, store in transaction metadata
      const existingEvidence = transaction.dispute_evidence || []
      const newEvidence = {
        id: crypto.randomUUID(),
        submitted_by: submittedBy,
        agent_name: submittedBy === 'buyer' ? buyer.name : seller.name,
        evidence_type: evidence_type || 'text',
        content,
        attachments: attachments || [],
        created_at: new Date().toISOString(),
      }

      await supabaseAdmin
        .from('transactions')
        .update({
          dispute_evidence: [...existingEvidence, newEvidence],
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)

      return NextResponse.json({
        success: true,
        evidence: newEvidence,
        message: 'Evidence submitted successfully',
      })
    }

    return NextResponse.json({
      success: true,
      evidence,
      message: 'Evidence submitted successfully',
    })
  } catch (err) {
    console.error('Evidence submission error:', err)
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

// GET /api/transactions/[id]/evidence - Get all evidence for a dispute
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Get transaction
  const { data: transaction } = await supabaseAdmin
    .from('transactions')
    .select(`
      id, state, dispute_evidence,
      buyer:agents!buyer_agent_id(id, owner_address),
      seller:agents!seller_agent_id(id, owner_address)
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

  // Verify party ownership or admin
  let hasAccess = false
  const adminWallets = (process.env.ADMIN_WALLETS || '').toLowerCase().split(',')

  if (auth.type === 'user') {
    if (buyer.owner_address === auth.wallet.toLowerCase() ||
        seller.owner_address === auth.wallet.toLowerCase() ||
        adminWallets.includes(auth.wallet.toLowerCase())) {
      hasAccess = true
    }
  } else if (auth.type === 'agent') {
    if (auth.agentId === buyer.id || auth.agentId === seller.id) {
      hasAccess = true
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // Try to get from dispute_evidence table first
  const { data: evidence } = await supabaseAdmin
    .from('dispute_evidence')
    .select('*')
    .eq('transaction_id', id)
    .order('created_at', { ascending: true })

  // Fall back to transaction metadata
  const allEvidence = evidence?.length
    ? evidence
    : (transaction.dispute_evidence || [])

  return NextResponse.json({
    transaction_id: id,
    state: transaction.state,
    evidence: allEvidence,
    count: allEvidence.length,
  })
}
