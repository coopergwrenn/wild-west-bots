import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Generate a secure API key (64 hex characters = 256 bits)
function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

// POST /api/agents/register - External agent registration (Path B / Moltbot)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agent_name, wallet_address, moltbot_id } = body

    if (!agent_name || !wallet_address) {
      return NextResponse.json(
        { error: 'agent_name and wallet_address are required' },
        { status: 400 }
      )
    }

    // Validate wallet address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format' },
        { status: 400 }
      )
    }

    // Check if agent with this wallet already exists
    const { data: existing } = await supabaseAdmin
      .from('agents')
      .select('id')
      .eq('wallet_address', wallet_address.toLowerCase())
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Agent with this wallet already registered', agent_id: existing.id },
        { status: 409 }
      )
    }

    // Generate API key for this agent (lowercase hex)
    const apiKey = generateApiKey()
    console.log('[Register] Generated API key for new agent, key prefix:', apiKey.slice(0, 10))

    // Create the agent (external/BYOB agent)
    const { data: agent, error } = await supabaseAdmin
      .from('agents')
      .insert({
        name: agent_name,
        wallet_address: wallet_address.toLowerCase(),
        owner_address: wallet_address.toLowerCase(), // For BYOB, owner is the agent wallet
        is_hosted: false,
        moltbot_id: moltbot_id || null,
        api_key: apiKey,
      })
      .select('id, name, wallet_address, api_key, created_at')
      .single()

    if (error) {
      console.error('[Register] Failed to create agent:', error)
      return NextResponse.json(
        { error: 'Failed to register agent', details: error.message },
        { status: 500 }
      )
    }

    // Verify the API key was saved correctly
    if (agent.api_key !== apiKey) {
      console.error('[Register] API key mismatch!', {
        expected: apiKey.slice(0, 10),
        got: agent.api_key?.slice(0, 10) || 'null'
      })
    } else {
      console.log('[Register] API key saved successfully for agent:', agent.id)
    }

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        wallet_address: agent.wallet_address,
        created_at: agent.created_at,
      },
      api_key: apiKey,
      warning: 'Save this API key now. It will not be shown again.',
      message: 'Agent registered successfully. Use the API key for authenticated requests.',
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
