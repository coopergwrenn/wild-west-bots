/**
 * Oracle Health Check Endpoint
 *
 * Per PRD Section 15 - GET /api/health/oracle
 * Public endpoint for oracle wallet and service health
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkOracleWalletHealth, getOracleAddress } from '@/lib/oracle/wallet'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get oracle wallet health
  const walletHealth = await checkOracleWalletHealth()

  // Get recent oracle run stats
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [releaseRuns, refundRuns] = await Promise.all([
    supabase
      .from('oracle_runs')
      .select('success_count, failure_count, completed_at')
      .eq('run_type', 'auto_release')
      .gte('started_at', oneDayAgo)
      .order('started_at', { ascending: false })
      .limit(50),
    supabase
      .from('oracle_runs')
      .select('success_count, failure_count, completed_at')
      .eq('run_type', 'auto_refund')
      .gte('started_at', oneDayAgo)
      .order('started_at', { ascending: false })
      .limit(50),
  ])

  // Calculate stats
  const releaseStats = {
    runs_24h: releaseRuns.data?.length || 0,
    success_count: releaseRuns.data?.reduce((sum, r) => sum + (r.success_count || 0), 0) || 0,
    failure_count: releaseRuns.data?.reduce((sum, r) => sum + (r.failure_count || 0), 0) || 0,
    last_run: releaseRuns.data?.[0]?.completed_at || null,
  }

  const refundStats = {
    runs_24h: refundRuns.data?.length || 0,
    success_count: refundRuns.data?.reduce((sum, r) => sum + (r.success_count || 0), 0) || 0,
    failure_count: refundRuns.data?.reduce((sum, r) => sum + (r.failure_count || 0), 0) || 0,
    last_run: refundRuns.data?.[0]?.completed_at || null,
  }

  // Determine overall health
  let status: 'healthy' | 'degraded' | 'critical' = 'healthy'

  if (walletHealth.warningLevel === 'critical') {
    status = 'critical'
  } else if (walletHealth.warningLevel === 'low') {
    status = 'degraded'
  } else if (releaseStats.failure_count > 5 || refundStats.failure_count > 5) {
    status = 'degraded'
  }

  // Get pending operations count
  const { count: pendingReleases } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('state', 'DELIVERED')
    .eq('contract_version', 2)

  const { count: pendingRefunds } = await supabase
    .from('transactions')
    .select('*', { count: 'exact', head: true })
    .eq('state', 'FUNDED')
    .eq('contract_version', 2)
    .lt('deadline', new Date().toISOString())

  return NextResponse.json({
    status,
    timestamp: new Date().toISOString(),
    oracle: {
      address: getOracleAddress() || 'not configured',
      wallet: {
        balance_eth: walletHealth.balanceEth,
        balance_usd: walletHealth.balanceUsd,
        status: walletHealth.warningLevel,
        healthy: walletHealth.healthy,
      },
    },
    operations: {
      release: {
        ...releaseStats,
        success_rate: releaseStats.runs_24h > 0
          ? Math.round((releaseStats.success_count / (releaseStats.success_count + releaseStats.failure_count || 1)) * 100)
          : 100,
      },
      refund: {
        ...refundStats,
        success_rate: refundStats.runs_24h > 0
          ? Math.round((refundStats.success_count / (refundStats.success_count + refundStats.failure_count || 1)) * 100)
          : 100,
      },
    },
    pending: {
      awaiting_release: pendingReleases || 0,
      awaiting_refund: pendingRefunds || 0,
    },
  })
}
