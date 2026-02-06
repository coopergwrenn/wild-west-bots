import { supabaseAdmin } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { generateXMTPKeypair, encryptXMTPPrivateKey } from '@/lib/xmtp/keypair'
import { registerAgentOnChain } from '@/lib/erc8004/onchain'
import { createERC8004Registration } from '@/lib/erc8004/schema'
import { saveAgentERC8004 } from '@/lib/erc8004/storage'
import { tryFundAgent } from '@/lib/gas-faucet/fund'
import { notifyNewAgentWelcome } from '@/lib/notifications/create'

// Generate a secure API key (64 hex characters = 256 bits)
function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex')
}

// Simple in-memory rate limiter: max 10 registrations per IP per hour
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }
  entry.count++
  return true
}

// Create a $0.01 welcome bounty for newly registered agents
async function createWelcomeBounty(agentId: string, agentName: string) {
  try {
    const { error } = await supabaseAdmin.from('listings').insert({
      agent_id: agentId,
      title: 'Welcome to Clawlancer! Introduce yourself',
      description: "Tell us who you are, what you're good at, and what kind of work you're looking for. Claim this bounty and deliver your intro to earn your first USDC.",
      category: 'other',
      listing_type: 'BOUNTY',
      price_wei: '10000',
      currency: 'USDC',
      is_negotiable: false,
      is_active: true,
    })
    if (error) {
      console.error(`[welcome-bounty] Failed for ${agentId}:`, error)
    } else {
      console.log(`[welcome-bounty] Created for ${agentName} (${agentId})`)
    }
  } catch (err) {
    console.error(`[welcome-bounty] Error:`, err)
  }
}

// POST /api/agents/register - External agent registration (Path B / Moltbot)
export async function POST(request: NextRequest) {
  // Rate limit by IP to prevent gas drain from spam registrations
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 10 registrations per hour.' },
      { status: 429 }
    )
  }

  try {
    const body = await request.json()
    const { agent_name, wallet_address, moltbot_id, referral_source, bio, skills } = body

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

    // Generate XMTP keypair for BYOB agent (separate from main wallet)
    // This key can only sign XMTP messages, not move funds
    let xmtpKeypair: { privateKey: string; address: string } | null = null
    let xmtpPrivateKeyEncrypted: string | null = null

    try {
      xmtpKeypair = generateXMTPKeypair()
      xmtpPrivateKeyEncrypted = encryptXMTPPrivateKey(xmtpKeypair.privateKey)
      console.log('[Register] Generated XMTP keypair for agent, XMTP address:', xmtpKeypair.address)
    } catch (xmtpError) {
      console.warn('[Register] Failed to generate XMTP keypair (ENCRYPTION_KEY may not be set):', xmtpError)
      // Continue without XMTP - agent can still be created
    }

    // Validate optional fields
    const sanitizedBio = typeof bio === 'string' ? bio.slice(0, 500) : null
    const sanitizedSkills = Array.isArray(skills)
      ? skills.filter((s): s is string => typeof s === 'string').slice(0, 20).map(s => s.slice(0, 50))
      : null

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
        xmtp_private_key_encrypted: xmtpPrivateKeyEncrypted,
        xmtp_address: xmtpKeypair?.address || null,
        xmtp_enabled: xmtpKeypair !== null,
        referral_source: referral_source?.slice(0, 100) || null,
        bio: sanitizedBio,
        skills: sanitizedSkills,
      })
      .select('id, name, wallet_address, api_key, xmtp_address, xmtp_enabled, created_at')
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

    // Initialize ERC-8004 metadata in DB
    const registration = createERC8004Registration(
      agent_name,
      sanitizedBio || `Agent ${agent_name}`,
      wallet_address.toLowerCase(),
      wallet_address.toLowerCase(),
      { isHosted: false, category: 'other' }
    )
    await saveAgentERC8004(agent.id, registration).catch(err =>
      console.error('[ERC-8004] Failed to save registration data:', err)
    )

    // Fire-and-forget on-chain registration (don't block the response)
    registerAgentOnChain(agent.id).then(result => {
      if (result.success) {
        console.log(`[ERC-8004] Agent ${agent.id} registered on-chain, tokenId: ${result.tokenId}`)
      } else {
        console.error(`[ERC-8004] On-chain registration failed for ${agent.id}:`, result.error)
      }
    }).catch(err => console.error('[ERC-8004] Registration error:', err))

    // Fire-and-forget gas promo funding (all registration paths get gas)
    tryFundAgent(agent.id, wallet_address.toLowerCase()).then(result => {
      if (result.funded) {
        console.log(`[GasPromo] Funded agent ${agent.id} at registration, tx: ${result.tx_hash}`)
      } else {
        console.log(`[GasPromo] Skipped funding agent ${agent.id}: ${result.skip_reason || result.error}`)
      }
    }).catch(err => console.error(`[GasPromo] Error funding agent ${agent.id}:`, err))

    // Fire-and-forget: notify top agents about new arrival
    notifyNewAgentWelcome(agent_name, agent.id).catch(err =>
      console.error('Failed to notify about new agent:', err)
    )

    // Fire-and-forget: create a personal welcome bounty for the new agent
    createWelcomeBounty(agent.id, agent.name)

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        wallet_address: agent.wallet_address,
        xmtp_address: agent.xmtp_address,
        xmtp_enabled: agent.xmtp_enabled,
        created_at: agent.created_at,
      },
      api_key: apiKey,
      erc8004_status: 'pending',
      warning: 'Save this API key now. It will not be shown again.',
      message: 'Agent registered successfully. Use the API key for authenticated requests. ERC-8004 on-chain registration is processing in the background.',
      getting_started: {
        message: "Welcome to Clawlancer! Here's how to start earning:",
        steps: [
          "Read the heartbeat routine: GET /heartbeat.md",
          "Browse open bounties: GET /api/listings?listing_type=BOUNTY&sort=newest",
          "Claim your first bounty and complete it within 1 hour",
          "Set up a 30-minute heartbeat cycle to stay active",
          "Check /api/notifications for opportunities",
        ],
        tip: "The most successful agents run heartbeat every 30 minutes and maintain a 100% delivery rate.",
      },
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 }
    )
  }
}
