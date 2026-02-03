/**
 * Admin Health Endpoint
 *
 * Per PRD Section 15 - Returns comprehensive system health:
 * - Oracle wallet balance
 * - Cron job status (last runs, success rates)
 * - Error rates
 * - Feature flag states
 * - Database health
 * - Pending operations counts
 */

import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, formatEther } from 'viem'
import { base } from 'viem/chains'
import { createClient } from '@supabase/supabase-js'

interface CronStatus {
  lastRun: string | null
  lastSuccess: boolean
  runsLast24h: number
  successRate: number
  failuresLast24h: number
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'critical'
  timestamp: string
  oracle: {
    address: string
    balanceEth: string
    balanceUsd: number
    status: 'ok' | 'low' | 'critical'
  }
  database: {
    connected: boolean
    latencyMs: number
  }
  crons: {
    'oracle-release': CronStatus
    'oracle-refund': CronStatus
    'reputation-cache': CronStatus
    'reconciliation': CronStatus
    'agent-heartbeat': CronStatus
  }
  featureFlags: Record<string, boolean>
  pendingOperations: {
    deliveredAwaitingRelease: number
    fundedPastDeadline: number
    disputedAwaitingResolution: number
    alertsUnresolved: number
  }
  errorRates: {
    last1h: number
    last24h: number
    threshold: number
  }
}

export async function GET(request: NextRequest) {
  // Verify admin auth
  const authHeader = request.headers.get('authorization')
  const adminWallet = request.headers.get('x-admin-wallet')?.toLowerCase()
  const adminWallets = (process.env.ADMIN_WALLETS || '').toLowerCase().split(',')

  const isAdmin = adminWallet && adminWallets.includes(adminWallet)
  const isCronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isAdmin && !isCronAuth) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.ALCHEMY_BASE_URL),
  })

  const now = new Date()
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  // Check database latency
  const dbStart = Date.now()
  const { error: dbError } = await supabase.from('agents').select('id').limit(1)
  const dbLatency = Date.now() - dbStart

  // Get oracle wallet balance
  let oracleBalance = BigInt(0)
  let oracleStatus: 'ok' | 'low' | 'critical' = 'ok'
  try {
    oracleBalance = await publicClient.getBalance({
      address: process.env.ORACLE_ADDRESS as `0x${string}`,
    })

    const balanceEth = parseFloat(formatEther(oracleBalance))
    if (balanceEth < 0.05) {
      oracleStatus = 'critical'
    } else if (balanceEth < 0.1) {
      oracleStatus = 'low'
    }
  } catch {
    oracleStatus = 'critical'
  }

  // Get cron status
  async function getCronStatus(runType: string): Promise<CronStatus> {
    const { data: runs } = await supabase
      .from('oracle_runs')
      .select('started_at, completed_at, success_count, failure_count')
      .eq('run_type', runType)
      .gte('started_at', oneDayAgo.toISOString())
      .order('started_at', { ascending: false })
      .limit(100)

    const lastRun = runs?.[0]
    const totalRuns = runs?.length || 0
    const successfulRuns = runs?.filter(r => r.failure_count === 0).length || 0
    const failedRuns = runs?.filter(r => r.failure_count > 0).length || 0

    return {
      lastRun: lastRun?.started_at || null,
      lastSuccess: lastRun ? lastRun.failure_count === 0 : false,
      runsLast24h: totalRuns,
      successRate: totalRuns > 0 ? successfulRuns / totalRuns : 0,
      failuresLast24h: failedRuns,
    }
  }

  const [releaseStatus, refundStatus, reputationStatus, reconciliationStatus, heartbeatStatus] =
    await Promise.all([
      getCronStatus('auto_release'),
      getCronStatus('auto_refund'),
      getCronStatus('reputation_cache'),
      getCronStatus('reconciliation'),
      getCronStatus('agent_heartbeat'),
    ])

  // Get feature flags
  const { data: flags } = await supabase.from('feature_flags').select('name, enabled')

  const featureFlags: Record<string, boolean> = {}
  for (const flag of flags || []) {
    featureFlags[flag.name] = flag.enabled
  }

  // Get pending operations
  const [
    { count: deliveredCount },
    { count: fundedPastDeadline },
    { count: disputedCount },
    { count: unresolvedAlerts },
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'DELIVERED')
      .eq('contract_version', 2),
    supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'FUNDED')
      .lt('deadline', now.toISOString())
      .eq('contract_version', 2),
    supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('state', 'DISPUTED')
      .eq('contract_version', 2),
    supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .in('level', ['error', 'critical'])
      .eq('resolved', false),
  ])

  // Get error rates
  const { count: errorsLast1h } = await supabase
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .in('level', ['error', 'critical'])
    .gte('created_at', oneHourAgo.toISOString())

  const { count: errorsLast24h } = await supabase
    .from('alerts')
    .select('*', { count: 'exact', head: true })
    .in('level', ['error', 'critical'])
    .gte('created_at', oneDayAgo.toISOString())

  // Determine overall status
  let overallStatus: 'healthy' | 'degraded' | 'critical' = 'healthy'

  if (
    oracleStatus === 'critical' ||
    dbError ||
    (errorsLast1h || 0) > 10 ||
    releaseStatus.failuresLast24h > 5
  ) {
    overallStatus = 'critical'
  } else if (
    oracleStatus === 'low' ||
    (errorsLast24h || 0) > 20 ||
    releaseStatus.successRate < 0.9 ||
    refundStatus.successRate < 0.9
  ) {
    overallStatus = 'degraded'
  }

  const balanceEth = formatEther(oracleBalance)

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: now.toISOString(),
    oracle: {
      address: process.env.ORACLE_ADDRESS || '',
      balanceEth,
      balanceUsd: parseFloat(balanceEth) * 2500, // Approximate ETH price
      status: oracleStatus,
    },
    database: {
      connected: !dbError,
      latencyMs: dbLatency,
    },
    crons: {
      'oracle-release': releaseStatus,
      'oracle-refund': refundStatus,
      'reputation-cache': reputationStatus,
      'reconciliation': reconciliationStatus,
      'agent-heartbeat': heartbeatStatus,
    },
    featureFlags,
    pendingOperations: {
      deliveredAwaitingRelease: deliveredCount || 0,
      fundedPastDeadline: fundedPastDeadline || 0,
      disputedAwaitingResolution: disputedCount || 0,
      alertsUnresolved: unresolvedAlerts || 0,
    },
    errorRates: {
      last1h: errorsLast1h || 0,
      last24h: errorsLast24h || 0,
      threshold: 5, // Alert if > 5 errors per hour
    },
  }

  return NextResponse.json(response)
}
