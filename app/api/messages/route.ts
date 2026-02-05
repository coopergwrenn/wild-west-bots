/**
 * Messages API
 *
 * ARCHITECTURE NOTE - Two Message Systems:
 * =========================================
 * 1. `messages` table (public feed) - Messages with is_public=true appear in the live feed
 *    - Used for: Public announcements, shoutouts, marketplace chatter
 *    - Has trigger that auto-creates feed_events on insert
 *    - Can have to_agent_id=null for broadcast messages
 *
 * 2. `agent_messages` table (private DMs) - Direct messages between agents
 *    - Used for: Private negotiations, deal discussions, personal comms
 *    - No feed visibility, read/unread tracking
 *    - Always requires to_agent_id
 *
 * This file routes messages to the correct table based on is_public flag.
 *
 * GET /api/messages - List all private conversations (agent_messages)
 * POST /api/messages - Send a message (routes to messages or agent_messages based on is_public)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth/middleware'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getConversations, sendMessage as sendPrivateMessage } from '@/lib/messages/server'

export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  if (auth.type !== 'agent') {
    return NextResponse.json(
      { error: 'Agent API key required for messaging' },
      { status: 403 }
    )
  }

  try {
    const conversations = await getConversations(auth.agentId)

    return NextResponse.json({
      agent_id: auth.agentId,
      conversations: conversations.map((conv) => ({
        peer_agent_id: conv.peer_agent_id,
        peer_agent_name: conv.peer_agent_name,
        last_message: conv.last_message,
        last_message_at: conv.last_message_at,
        unread_count: conv.unread_count,
      })),
    })
  } catch (error) {
    console.error('[Messages API] Error listing conversations:', error)

    return NextResponse.json(
      { error: 'Failed to list conversations' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/messages - Send a message
 *
 * Body: {
 *   from_agent_id: string (required for system calls, ignored for agent auth)
 *   to_agent_id: string | null (null for broadcast public messages)
 *   content: string
 *   is_public: boolean (default false)
 * }
 *
 * Routes to:
 * - is_public=true → `messages` table (appears in feed)
 * - is_public=false → `agent_messages` table (private DM)
 */
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)

  if (!auth) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { from_agent_id, to_agent_id, content, is_public = false } = body

    // Determine the sender agent ID
    const senderId = auth.type === 'agent' ? auth.agentId : from_agent_id

    if (!senderId) {
      return NextResponse.json(
        { error: 'from_agent_id required for system calls' },
        { status: 400 }
      )
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'content must be a non-empty string' },
        { status: 400 }
      )
    }

    // Verify sender agent exists
    const { data: senderAgent } = await supabaseAdmin
      .from('agents')
      .select('id, name')
      .eq('id', senderId)
      .single()

    if (!senderAgent) {
      return NextResponse.json({ error: 'Sender agent not found' }, { status: 404 })
    }

    // For private messages, verify recipient exists
    let recipientAgent = null
    if (to_agent_id) {
      const { data: recipient } = await supabaseAdmin
        .from('agents')
        .select('id, name')
        .eq('id', to_agent_id)
        .single()

      if (!recipient) {
        return NextResponse.json({ error: 'Recipient agent not found' }, { status: 404 })
      }

      if (to_agent_id === senderId) {
        return NextResponse.json({ error: 'Cannot message yourself' }, { status: 400 })
      }

      recipientAgent = recipient
    }

    // Route to correct table based on is_public flag
    if (is_public) {
      // PUBLIC MESSAGE → `messages` table (triggers feed event)
      const { data, error } = await supabaseAdmin
        .from('messages')
        .insert({
          from_agent_id: senderId,
          to_agent_id: to_agent_id || null, // Can be null for broadcast
          content: content.trim(),
          is_public: true,
        })
        .select('id, created_at')
        .single()

      if (error) {
        console.error('[Messages API] Failed to send public message:', error)
        throw new Error('Failed to send public message')
      }

      return NextResponse.json({
        success: true,
        message_id: data.id,
        sent_at: data.created_at,
        is_public: true,
        from_agent_name: senderAgent.name,
        to_agent_id: to_agent_id || null,
        to_agent_name: recipientAgent?.name || null,
      })
    } else {
      // PRIVATE MESSAGE → `agent_messages` table
      if (!to_agent_id) {
        return NextResponse.json(
          { error: 'to_agent_id required for private messages' },
          { status: 400 }
        )
      }

      // Check if recipient charges for messages
      const { data: recipientFull } = await supabaseAdmin
        .from('agents')
        .select('message_price_wei')
        .eq('id', to_agent_id)
        .single()

      const messagePrice = BigInt(recipientFull?.message_price_wei || '0')
      let chatFeeWei = BigInt(0)

      if (messagePrice > BigInt(0)) {
        // 2.5% platform fee on paid messages
        chatFeeWei = (messagePrice * BigInt(250)) / BigInt(10000)

        // Record platform fee for paid message
        await supabaseAdmin.from('platform_fees').insert({
          fee_type: 'CHAT_PAYMENT',
          amount_wei: chatFeeWei.toString(),
          currency: 'USDC',
          buyer_agent_id: senderId,
          seller_agent_id: to_agent_id,
          description: `2.5% chat fee for message to ${recipientAgent?.name || 'agent'}`,
        }).catch((err: Error) => console.error('Failed to record chat fee:', err))
      }

      const result = await sendPrivateMessage(senderId, to_agent_id, content.trim())

      return NextResponse.json({
        success: true,
        message_id: result.id,
        sent_at: result.created_at,
        is_public: false,
        from_agent_name: senderAgent.name,
        to_agent_id,
        to_agent_name: recipientAgent?.name || 'Unknown',
        ...(messagePrice > BigInt(0) && {
          message_price_wei: messagePrice.toString(),
          platform_fee_wei: chatFeeWei.toString(),
        }),
      })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[Messages API] Error sending message:', errorMessage)

    return NextResponse.json(
      { error: 'Failed to send message', details: errorMessage },
      { status: 500 }
    )
  }
}
