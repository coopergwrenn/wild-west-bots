/**
 * Agent ID Card Endpoint
 *
 * Per PRD Section 10 - GET /api/agents/[id]/card
 * Generates agent ID card as PNG image (1200x630 for OpenGraph)
 * Used in ERC-8004 registration and social sharing
 */

import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'edge'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: agent } = await supabase
    .from('agents')
    .select(`
      id, name, wallet_address, created_at,
      reputation_score, reputation_tier, reputation_transactions
    `)
    .eq('id', id)
    .single()

  if (!agent) {
    return new Response('Agent not found', { status: 404 })
  }

  const tier = agent.reputation_tier || 'new'
  const score = agent.reputation_score || 0
  const transactions = agent.reputation_transactions || 0

  // Tier colors
  const tierColors: Record<string, string> = {
    new: '#6b7280',
    established: '#3b82f6',
    trusted: '#10b981',
    veteran: '#f59e0b',
  }

  const tierColor = tierColors[tier] || tierColors.new

  // Generate 1200x630 PNG (OpenGraph standard)
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#0a0a0a',
          padding: '60px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '40px' }}>
          {/* Avatar */}
          <div
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '60px',
              backgroundColor: '#1f2937',
              border: `4px solid ${tierColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
            }}
          >
            🤖
          </div>
          {/* Name and wallet */}
          <div style={{ marginLeft: '30px', display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                color: 'white',
                fontSize: '48px',
                fontWeight: 'bold',
                marginBottom: '8px',
              }}
            >
              {agent.name}
            </div>
            <div style={{ color: '#9ca3af', fontSize: '24px' }}>
              {agent.wallet_address?.slice(0, 6)}...{agent.wallet_address?.slice(-4)}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: '60px', marginBottom: '40px' }}>
          {/* Score */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#9ca3af', fontSize: '18px', marginBottom: '8px' }}>
              Reputation
            </div>
            <div style={{ color: 'white', fontSize: '42px', fontWeight: 'bold' }}>
              {score}
              <span style={{ color: '#6b7280', fontSize: '24px' }}>/100</span>
            </div>
          </div>

          {/* Tier */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#9ca3af', fontSize: '18px', marginBottom: '8px' }}>
              Tier
            </div>
            <div
              style={{
                color: tierColor,
                fontSize: '42px',
                fontWeight: 'bold',
                textTransform: 'capitalize',
              }}
            >
              {tier}
            </div>
          </div>

          {/* Transactions */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#9ca3af', fontSize: '18px', marginBottom: '8px' }}>
              Transactions
            </div>
            <div style={{ color: 'white', fontSize: '42px', fontWeight: 'bold' }}>
              {transactions}
            </div>
          </div>
        </div>

        {/* Tier Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '16px 24px',
            backgroundColor: '#1f2937',
            borderRadius: '12px',
            border: `2px solid ${tierColor}`,
            alignSelf: 'flex-start',
          }}
        >
          <div style={{ color: tierColor, fontSize: '24px', fontWeight: 'bold' }}>
            {tier === 'new' && '🌱 New Agent'}
            {tier === 'established' && '📈 Established'}
            {tier === 'trusted' && '✅ Trusted'}
            {tier === 'veteran' && '⭐ Veteran'}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ color: '#6b7280', fontSize: '20px' }}>
            🤠 Wild West Bots
          </div>
          <div style={{ color: '#6b7280', fontSize: '20px' }}>
            wildwestbots.com
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
