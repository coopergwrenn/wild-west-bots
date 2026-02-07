import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { PrivyClient } from '@privy-io/node'
import { supabaseAdmin } from '@/lib/supabase/server'

type AuthResult =
  | { type: 'user'; wallet: string }
  | { type: 'system' }
  | { type: 'agent'; agentId: string; wallet: string }
  | null

// Initialize Privy client for token verification
const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || process.env.PRIVY_APP_ID
const appSecret = process.env.PRIVY_APP_SECRET

let privyClient: PrivyClient | null = null
if (appId && appSecret) {
  privyClient = new PrivyClient({
    appId,
    appSecret,
  })
  console.log('[Auth] Privy client initialized with appId:', appId.slice(0, 10) + '...')
} else {
  console.warn('[Auth] Privy client NOT initialized - missing credentials:', { hasAppId: !!appId, hasAppSecret: !!appSecret })
}

export async function verifyAuth(request: Request): Promise<AuthResult> {
  const auth = request.headers.get('authorization')

  // Log environment status on every auth attempt
  console.log('[Auth] Environment check:', {
    hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
  })

  // System auth (agent runner, cron)
  if (
    auth === `Bearer ${process.env.AGENT_RUNNER_SECRET}` ||
    auth === `Bearer ${process.env.CRON_SECRET}`
  ) {
    return { type: 'system' }
  }

  // Check for API key auth (Path B agents)
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim()  // Trim whitespace
    console.log('[Auth] Token received, length:', token.length, 'first 10 chars:', token.slice(0, 10))

    // Check for new clw_ prefixed API keys (stored as sha256 hash)
    if (/^clw_[a-fA-F0-9]{32}$/.test(token)) {
      const hashedKey = crypto.createHash('sha256').update(token).digest('hex')
      console.log('[Auth] clw_ key detected, looking up hash...')

      const { data: clwAgent } = await supabaseAdmin
        .from('agents')
        .select('id, wallet_address')
        .eq('api_key', hashedKey)
        .single()

      if (clwAgent) {
        console.log('[Auth] Agent found via clw_ key:', clwAgent.id)
        return { type: 'agent', agentId: clwAgent.id, wallet: clwAgent.wallet_address }
      } else {
        console.log('[Auth] No agent found with this clw_ key hash')
      }
    }

    // Check if it's a legacy agent API key (64 char hex string, case insensitive)
    if (/^[a-fA-F0-9]{64}$/.test(token)) {
      const normalizedKey = token.toLowerCase()
      console.log('[Auth] Token matches API key format, querying database...')
      console.log('[Auth] Normalized key prefix:', normalizedKey.slice(0, 16))

      const { data: agent, error: agentError } = await supabaseAdmin
        .from('agents')
        .select('id, wallet_address, api_key')
        .eq('api_key', normalizedKey)
        .single()

      if (agentError) {
        console.log('[Auth] Database query error:', agentError.message, agentError.code)

        // Additional debug: try to find ANY agent with api_key starting with same prefix
        const { data: debugAgents } = await supabaseAdmin
          .from('agents')
          .select('id, name, api_key')
          .not('api_key', 'is', null)
          .limit(5)

        if (debugAgents && debugAgents.length > 0) {
          console.log('[Auth] Debug - Found agents with api_keys:')
          debugAgents.forEach((a: { id: string; name: string; api_key: string | null }) => {
            console.log(`  - ${a.name}: key prefix = ${a.api_key?.slice(0, 16) || 'NULL'}`)
          })
        } else {
          console.log('[Auth] Debug - No agents found with non-null api_keys!')
        }
      }

      if (agent) {
        console.log('[Auth] Agent found:', agent.id)
        // Verify the key matches exactly
        if (agent.api_key !== normalizedKey) {
          console.log('[Auth] WARNING: Key mismatch after query!', {
            queried: normalizedKey.slice(0, 16),
            stored: agent.api_key?.slice(0, 16)
          })
        }
        return { type: 'agent', agentId: agent.id, wallet: agent.wallet_address }
      } else {
        console.log('[Auth] No agent found with this API key')
      }
    } else {
      console.log('[Auth] Token does not match API key format (not 64 hex chars)')
    }

    // Try Privy access token verification first
    if (privyClient) {
      try {
        console.log('[Auth] Attempting Privy token verification...')
        const verifiedClaims = await privyClient.utils().auth().verifyAuthToken(token)
        console.log('[Auth] Privy token verified, user_id:', verifiedClaims.user_id)

        // Get user's linked wallets
        if (verifiedClaims.user_id) {
          // Use _get to fetch user by ID (internal method but available in SDK)
          const user = await privyClient.users()._get(verifiedClaims.user_id)
          console.log('[Auth] User fetched, linked_accounts count:', user.linked_accounts?.length || 0)

          // Find the user's wallet address (embedded wallet or linked wallet)
          const walletAccount = user.linked_accounts?.find(
            (account) => account.type === 'wallet'
          )

          if (walletAccount && 'address' in walletAccount && walletAccount.address) {
            console.log('[Auth] Found wallet address:', walletAccount.address.slice(0, 10) + '...')
            return { type: 'user', wallet: walletAccount.address.toLowerCase() }
          } else {
            console.warn('[Auth] No wallet found in user linked accounts')
          }
        }
      } catch (privyError) {
        // Token is not a valid Privy token, try other methods
        console.error('[Auth] Privy token verification failed:', privyError)
      }
    } else {
      console.warn('[Auth] Privy client not available, skipping Privy auth')
    }

    // Fallback: User auth (Supabase JWT from Privy bridge)
    try {
      const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as {
        wallet_address: string
      }
      return { type: 'user', wallet: decoded.wallet_address }
    } catch {
      return null
    }
  }

  return null
}

export function requireAuth(auth: AuthResult): auth is NonNullable<AuthResult> {
  return auth !== null
}

export function requireSystemAuth(auth: AuthResult): auth is { type: 'system' } {
  return auth?.type === 'system'
}

export function requireUserAuth(auth: AuthResult): auth is { type: 'user'; wallet: string } {
  return auth?.type === 'user'
}

export function requireAgentAuth(auth: AuthResult): auth is { type: 'agent'; agentId: string; wallet: string } {
  return auth?.type === 'agent'
}
