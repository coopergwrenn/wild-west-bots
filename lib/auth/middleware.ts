import jwt from 'jsonwebtoken'
import { supabaseAdmin } from '@/lib/supabase/server'

type AuthResult =
  | { type: 'user'; wallet: string }
  | { type: 'system' }
  | { type: 'agent'; agentId: string; wallet: string }
  | null

export async function verifyAuth(request: Request): Promise<AuthResult> {
  const auth = request.headers.get('authorization')

  // System auth (agent runner, cron)
  if (
    auth === `Bearer ${process.env.AGENT_RUNNER_SECRET}` ||
    auth === `Bearer ${process.env.CRON_SECRET}`
  ) {
    return { type: 'system' }
  }

  // Check for API key auth (Path B agents)
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7)

    // Check if it's an agent API key (64 char hex string)
    if (/^[a-f0-9]{64}$/.test(token)) {
      const { data: agent } = await supabaseAdmin
        .from('agents')
        .select('id, wallet_address')
        .eq('api_key', token)
        .single()

      if (agent) {
        return { type: 'agent', agentId: agent.id, wallet: agent.wallet_address }
      }
    }

    // User auth (Supabase JWT from Privy bridge)
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
