/**
 * Reputation Cache Management
 *
 * Per PRD Section 6 & 11 - Manages reputation score caching
 * Scores are derived from on-chain events, cached locally for performance
 */

import { createClient } from '@supabase/supabase-js';
import { calculateReputationScore, ReputationScore } from './calculate';

// Extended reputation score with additional metrics from calculateReputationScore
export type ExtendedReputationScore = ReputationScore & {
  transactionCount: number;
  successRate: number;
  totalVolumeUsd: number;
  avgCompletionTimeHours: number;
  disputeRate: number;
};

export interface CachedReputation {
  agent_id: string;
  score: number;
  tier: string;
  transaction_count: number;
  success_rate: number;
  total_volume_usd: number;
  avg_completion_time_hours: number;
  dispute_rate: number;
  calculated_at: string;
}

/**
 * Get cached reputation for an agent
 */
export async function getCachedReputation(
  supabase: ReturnType<typeof createClient>,
  agentId: string
): Promise<CachedReputation | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('reputation_cache')
    .select('*')
    .eq('agent_id', agentId)
    .single();

  return data;
}

/**
 * Update reputation cache for an agent
 */
export async function updateReputationCache(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  reputation: ExtendedReputationScore
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('reputation_cache')
    .upsert({
      agent_id: agentId,
      score: reputation.score,
      tier: reputation.tier,
      transaction_count: reputation.transactionCount,
      success_rate: reputation.successRate,
      total_volume_usd: reputation.totalVolumeUsd,
      avg_completion_time_hours: reputation.avgCompletionTimeHours,
      dispute_rate: reputation.disputeRate,
      calculated_at: new Date().toISOString(),
    });
}

/**
 * Recalculate and cache reputation for an agent
 * Uses transaction data (derived from on-chain events per Section 1)
 */
export async function recalculateReputation(
  supabase: ReturnType<typeof createClient>,
  agentId: string
): Promise<ExtendedReputationScore> {
  // Get agent details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: agent } = await (supabase as any)
    .from('agents')
    .select('id, created_at')
    .eq('id', agentId)
    .single();

  if (!agent) {
    throw new Error('Agent not found');
  }

  // Get transaction stats
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: transactions } = await (supabase as any)
    .from('transactions')
    .select('state, amount_wei, price_wei, created_at, completed_at, disputed')
    .or(`buyer_agent_id.eq.${agentId},seller_agent_id.eq.${agentId}`);

  interface TransactionRow {
    state: string;
    amount_wei?: string;
    price_wei?: string;
    created_at: string;
    completed_at?: string;
    disputed?: boolean;
  }
  const txs: TransactionRow[] = transactions || [];

  // Calculate stats
  const transactionCount = txs.length;
  const successfulTransactions = txs.filter((t: TransactionRow) => t.state === 'RELEASED').length;
  const disputedTransactions = txs.filter((t: TransactionRow) => t.disputed).length;

  // Calculate total volume in USD (assuming USDC with 6 decimals)
  const totalVolumeUsd = txs.reduce((sum: number, t: TransactionRow) => {
    const amount = t.amount_wei || t.price_wei || '0';
    return sum + parseFloat(amount) / 1e6;
  }, 0);

  // Calculate average completion time for released transactions
  const completedTxs = txs.filter((t: TransactionRow) => t.state === 'RELEASED' && t.created_at && t.completed_at);
  const avgCompletionTimeHours = completedTxs.length > 0
    ? completedTxs.reduce((sum: number, t: TransactionRow) => {
        const created = new Date(t.created_at).getTime();
        const completed = new Date(t.completed_at!).getTime();
        return sum + (completed - created) / (1000 * 60 * 60);
      }, 0) / completedTxs.length
    : 0;

  // Calculate reputation score
  const reputation = calculateReputationScore(
    transactionCount,
    successfulTransactions,
    disputedTransactions,
    totalVolumeUsd,
    avgCompletionTimeHours,
    new Date(agent.created_at)
  );

  // Update cache
  await updateReputationCache(supabase, agentId, reputation);

  // Also update agent's reputation columns
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('agents')
    .update({
      reputation_score: reputation.score,
      reputation_tier: reputation.tier,
      reputation_transactions: reputation.transactionCount,
      reputation_success_rate: Math.round(reputation.successRate * 100),
      reputation_updated_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  return reputation;
}

/**
 * Get reputation for multiple agents (batch)
 */
export async function getBatchReputation(
  supabase: ReturnType<typeof createClient>,
  agentIds: string[]
): Promise<Map<string, CachedReputation>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('reputation_cache')
    .select('*')
    .in('agent_id', agentIds);

  const map = new Map<string, CachedReputation>();
  for (const rep of data || []) {
    map.set(rep.agent_id, rep);
  }

  return map;
}

/**
 * Invalidate reputation cache for an agent
 * Call this after transaction state changes
 */
export async function invalidateReputationCache(
  supabase: ReturnType<typeof createClient>,
  agentId: string
): Promise<void> {
  // Mark as stale by updating calculated_at to far past
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('reputation_cache')
    .update({
      calculated_at: new Date(0).toISOString(),
    })
    .eq('agent_id', agentId);
}

/**
 * Get stale reputation caches that need recalculation
 */
export async function getStaleReputationCaches(
  supabase: ReturnType<typeof createClient>,
  maxAgeHours: number = 1
): Promise<string[]> {
  const staleThreshold = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('reputation_cache')
    .select('agent_id')
    .lt('calculated_at', staleThreshold);

  return (data || []).map((d: { agent_id: string }) => d.agent_id);
}

/**
 * Format reputation for API response
 */
export function formatReputationResponse(cached: CachedReputation) {
  return {
    score: cached.score,
    tier: cached.tier,
    transaction_count: cached.transaction_count,
    success_rate: cached.success_rate,
    total_volume_usd: cached.total_volume_usd,
    avg_completion_time_hours: cached.avg_completion_time_hours,
    dispute_rate: cached.dispute_rate,
    last_updated: cached.calculated_at,
  };
}
