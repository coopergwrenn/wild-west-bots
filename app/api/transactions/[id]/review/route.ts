/**
 * Transaction Review API
 *
 * POST /api/transactions/[id]/review - Submit a review for a completed transaction
 *
 * Both buyer and seller can review each other after the transaction is RELEASED.
 * Each party can only submit one review per transaction.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { notifyReviewReceived } from '@/lib/notifications/create'
import { postFeedbackOnChain } from '@/lib/erc8004/onchain'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: transactionId } = await params
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { agent_id, rating, comment, review_text, text, content } = body

    // Accept multiple field names for review text
    const reviewContent = review_text || comment || text || content

    // Validate rating
    if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: 'Rating must be a number between 1 and 5' },
        { status: 400 }
      )
    }

    // Validate review text if provided
    if (reviewContent && (typeof reviewContent !== 'string' || reviewContent.length > 1000)) {
      return NextResponse.json(
        { error: 'Review text must be a string under 1000 characters' },
        { status: 400 }
      )
    }

    // Get the transaction
    const { data: transaction, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('id, buyer_agent_id, seller_agent_id, state')
      .eq('id', transactionId)
      .single()

    if (txError || !transaction) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
    }

    // Check transaction is completed (RELEASED)
    if (transaction.state !== 'RELEASED') {
      return NextResponse.json(
        { error: 'Can only review completed (RELEASED) transactions' },
        { status: 400 }
      )
    }

    // Determine reviewer and reviewed based on agent_id
    // Normalize IDs for comparison to handle case differences
    const reviewerAgentIdNorm = String(agent_id).toLowerCase().trim()
    const buyerAgentIdNorm = String(transaction.buyer_agent_id).toLowerCase().trim()
    const sellerAgentIdNorm = String(transaction.seller_agent_id).toLowerCase().trim()
    let reviewedAgentId: string
    let reviewerAgentId: string

    if (reviewerAgentIdNorm === buyerAgentIdNorm) {
      // Buyer is reviewing seller
      reviewerAgentId = transaction.buyer_agent_id
      reviewedAgentId = transaction.seller_agent_id
    } else if (reviewerAgentIdNorm === sellerAgentIdNorm) {
      // Seller is reviewing buyer
      reviewerAgentId = transaction.seller_agent_id
      reviewedAgentId = transaction.buyer_agent_id
    } else {
      return NextResponse.json(
        { error: 'Agent is not a party to this transaction' },
        { status: 403 }
      )
    }

    // Verify auth permissions
    if (auth.type === 'agent' && String(auth.agentId).toLowerCase().trim() !== reviewerAgentIdNorm) {
      return NextResponse.json(
        { error: 'Not authorized to review as this agent' },
        { status: 403 }
      )
    }

    if (auth.type === 'user') {
      // Verify user owns the reviewer agent
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('owner_address')
        .eq('id', reviewerAgentId)
        .single()

      if (!agent || agent.owner_address !== auth.wallet.toLowerCase()) {
        return NextResponse.json(
          { error: 'Not authorized to review as this agent' },
          { status: 403 }
        )
      }
    }

    // Check if already reviewed
    const { data: existingReview } = await supabaseAdmin
      .from('reviews')
      .select('id')
      .eq('transaction_id', transactionId)
      .eq('reviewer_agent_id', reviewerAgentId)
      .single()

    if (existingReview) {
      return NextResponse.json(
        { error: 'You have already reviewed this transaction' },
        { status: 400 }
      )
    }

    // Create the review
    const { data: review, error: reviewError } = await supabaseAdmin
      .from('reviews')
      .insert({
        transaction_id: transactionId,
        reviewer_agent_id: reviewerAgentId,
        reviewed_agent_id: reviewedAgentId,
        rating,
        review_text: reviewContent?.trim() || null,
      })
      .select(`
        id, rating, review_text, created_at,
        reviewer:agents!reviewer_agent_id(id, name),
        reviewed:agents!reviewed_agent_id(id, name)
      `)
      .single()

    if (reviewError) {
      console.error('Failed to create review:', reviewError)
      return NextResponse.json({ error: 'Failed to create review' }, { status: 500 })
    }

    // Notify the reviewed agent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reviewerInfo = review.reviewer as any
    await notifyReviewReceived(
      reviewedAgentId,
      reviewerInfo?.name || 'An agent',
      rating,
      reviewContent?.trim() || null,
      transactionId
    ).catch(err => console.error('Failed to send review notification:', err))

    // Post feedback on-chain (fire-and-forget)
    const { data: reviewedAgent } = await supabaseAdmin
      .from('agents')
      .select('erc8004_token_id')
      .eq('id', reviewedAgentId)
      .single()

    if (reviewedAgent?.erc8004_token_id) {
      postFeedbackOnChain(
        reviewedAgent.erc8004_token_id,
        rating,
        transactionId,
        review.id,
        reviewContent?.trim() || null
      ).then(result => {
        if (result.success) {
          console.log(`[ERC-8004] Feedback posted on-chain for review ${review.id}, tx: ${result.txHash}`)
          // Store tx hash on the review record
          supabaseAdmin.from('reviews')
            .update({ onchain_tx_hash: result.txHash })
            .eq('id', review.id)
            .then(() => {})
        } else {
          console.error(`[ERC-8004] Feedback posting failed for review ${review.id}:`, result.error)
        }
      }).catch(err => console.error('[ERC-8004] Feedback posting error:', err))
    }

    return NextResponse.json({
      success: true,
      review: {
        id: review.id,
        rating: review.rating,
        review_text: review.review_text,
        created_at: review.created_at,
        reviewer: review.reviewer,
        reviewed: review.reviewed,
      },
    })
  } catch (error) {
    console.error('Review error:', error)
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

// GET /api/transactions/[id]/review - Get reviews for a transaction
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: transactionId } = await params

  const { data: reviews, error } = await supabaseAdmin
    .from('reviews')
    .select(`
      id, rating, review_text, created_at,
      reviewer:agents!reviewer_agent_id(id, name, avatar_url),
      reviewed:agents!reviewed_agent_id(id, name)
    `)
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch reviews:', error)
    return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 })
  }

  return NextResponse.json({ reviews: reviews || [] })
}
