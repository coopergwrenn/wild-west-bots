/**
 * Admin Gas Promo Stats
 * GET /api/admin/gas-promo-stats
 *
 * Admin-only endpoint (wallet + cron secret pattern from health endpoint).
 * Returns detailed gas promo metrics.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { supabaseAdmin } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  // Verify admin auth (same pattern as health endpoint)
  const authHeader = request.headers.get('authorization')
  const adminWallet = request.headers.get('x-admin-wallet')?.toLowerCase()
  const adminWallets = (process.env.ADMIN_WALLETS || '').toLowerCase().split(',')

  const isAdmin = adminWallet && adminWallets.includes(adminWallet)
  const isCronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isAdmin && !isCronAuth) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Get promo counter
  const { data: setting } = await supabaseAdmin
    .from('platform_settings')
    .select('value')
    .eq('key', 'gas_promo_count')
    .single()

  const fundedCount = parseInt(setting?.value || '0')

  // Get faucet wallet balance
  let faucetAddress = ''
  let faucetBalanceEth = '0'

  try {
    const rawKey = process.env.GAS_FAUCET_PRIVATE_KEY
    if (rawKey) {
      const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`
      const account = privateKeyToAccount(privateKey as `0x${string}`)
      faucetAddress = account.address

      const publicClient = createPublicClient({
        chain: base,
        transport: http(process.env.ALCHEMY_BASE_URL),
      })

      const balance = await publicClient.getBalance({ address: account.address })
      faucetBalanceEth = formatEther(balance)
    }
  } catch {
    // faucet key not configured
  }

  // Referral source breakdown
  const { data: referrals } = await supabaseAdmin
    .from('agents')
    .select('referral_source')
    .not('referral_source', 'is', null)

  const referralBreakdown: Record<string, number> = {}
  for (const r of referrals || []) {
    const src = r.referral_source || 'unknown'
    referralBreakdown[src] = (referralBreakdown[src] || 0) + 1
  }

  // Recent fundings
  const { data: recentFundings } = await supabaseAdmin
    .from('gas_promo_log')
    .select('agent_id, wallet_address, amount_eth, tx_hash, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  // Failure count
  const { count: failureCount } = await supabaseAdmin
    .from('gas_promo_log')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'FAILED')

  return NextResponse.json({
    promo_enabled: process.env.GAS_PROMO_ENABLED === 'true',
    funded_count: fundedCount,
    total_slots: 100,
    remaining_slots: Math.max(0, 100 - fundedCount),
    faucet: {
      address: faucetAddress,
      balance_eth: faucetBalanceEth,
    },
    referral_breakdown: referralBreakdown,
    recent_fundings: recentFundings || [],
    failure_count: failureCount || 0,
  })
}
