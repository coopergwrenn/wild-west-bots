/**
 * Oracle Dispute Resolution Logic
 *
 * Per PRD Section 5, 8 & 11 - Handles dispute resolution
 * All resolutions are ON-CHAIN and VERIFIABLE via tx_hash
 */

import { createPublicClient, createWalletClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { ESCROW_V2_ABI, ESCROW_V2_ADDRESS, uuidToBytes32, EscrowStateV2 } from '@/lib/blockchain/escrow-v2';
import { executeWithRetry } from './retry';

const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia';
const CHAIN = isTestnet ? baseSepolia : base;

function getPublicClient() {
  return createPublicClient({
    chain: CHAIN,
    transport: http(process.env.ALCHEMY_BASE_URL),
  });
}

function getOracleWalletClient() {
  const privateKey = process.env.ORACLE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('ORACLE_PRIVATE_KEY not set');
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);

  return createWalletClient({
    account,
    chain: CHAIN,
    transport: http(process.env.ALCHEMY_BASE_URL),
  });
}

export interface ResolveResult {
  success: boolean;
  txHash?: string;
  resolution?: 'released' | 'refunded';
  alreadyResolved?: boolean;
  error?: string;
}

/**
 * Check if an escrow is disputed and awaiting resolution
 */
export async function isAwaitingResolution(escrowId: string): Promise<boolean> {
  const publicClient = getPublicClient();
  const bytes32Id = uuidToBytes32(escrowId);

  try {
    const escrow = await publicClient.readContract({
      address: ESCROW_V2_ADDRESS,
      abi: ESCROW_V2_ABI,
      functionName: 'getEscrow',
      args: [bytes32Id],
    });

    return escrow.state === EscrowStateV2.DISPUTED && escrow.disputed;
  } catch (error) {
    console.error(`Error checking dispute status for ${escrowId}:`, error);
    return false;
  }
}

/**
 * Execute oracle dispute resolution
 * @param escrowId - The escrow to resolve
 * @param releaseToSeller - true to release funds to seller, false to refund buyer
 */
export async function executeResolveDispute(
  escrowId: string,
  releaseToSeller: boolean
): Promise<ResolveResult> {
  const publicClient = getPublicClient();
  const bytes32Id = uuidToBytes32(escrowId);

  try {
    // First check current state (idempotency)
    const escrow = await publicClient.readContract({
      address: ESCROW_V2_ADDRESS,
      abi: ESCROW_V2_ABI,
      functionName: 'getEscrow',
      args: [bytes32Id],
    });

    // Already released
    if (escrow.state === EscrowStateV2.RELEASED) {
      return { success: true, alreadyResolved: true, resolution: 'released' };
    }

    // Already refunded
    if (escrow.state === EscrowStateV2.REFUNDED) {
      return { success: true, alreadyResolved: true, resolution: 'refunded' };
    }

    // Must be disputed to resolve
    if (escrow.state !== EscrowStateV2.DISPUTED) {
      return { success: false, error: 'Escrow is not in disputed state' };
    }

    // Execute resolution with retry
    const walletClient = getOracleWalletClient();

    const result = await executeWithRetry(
      async () => {
        const hash = await walletClient.writeContract({
          address: ESCROW_V2_ADDRESS,
          abi: ESCROW_V2_ABI,
          functionName: 'resolveDispute',
          args: [bytes32Id, releaseToSeller],
        });

        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
      },
      `resolveDispute(${escrowId}, ${releaseToSeller})`
    );

    if (result.success) {
      return {
        success: true,
        txHash: result.result,
        resolution: releaseToSeller ? 'released' : 'refunded',
      };
    } else {
      return { success: false, error: result.lastError };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

/**
 * Get escrow details for dispute review
 */
export async function getDisputeDetails(escrowId: string) {
  const publicClient = getPublicClient();
  const bytes32Id = uuidToBytes32(escrowId);

  try {
    const escrow = await publicClient.readContract({
      address: ESCROW_V2_ADDRESS,
      abi: ESCROW_V2_ABI,
      functionName: 'getEscrow',
      args: [bytes32Id],
    });

    return {
      buyer: escrow.buyer,
      seller: escrow.seller,
      amount: escrow.amount,
      createdAt: new Date(Number(escrow.createdAt) * 1000),
      deadline: new Date(Number(escrow.deadline) * 1000),
      deliveredAt: escrow.deliveredAt > 0 ? new Date(Number(escrow.deliveredAt) * 1000) : null,
      disputeWindowHours: Number(escrow.disputeWindowHours),
      deliverableHash: escrow.deliverableHash,
      state: escrow.state,
      disputed: escrow.disputed,
    };
  } catch (error) {
    console.error(`Error getting dispute details for ${escrowId}:`, error);
    return null;
  }
}

/**
 * Decision criteria per PRD Section 8
 */
export type DisputeDecision = 'release_to_seller' | 'refund_buyer';

export interface DisputeDecisionCriteria {
  decision: DisputeDecision;
  reason: string;
}

/**
 * Document decision for audit trail
 */
export function documentDecision(
  escrowId: string,
  decision: DisputeDecision,
  reason: string,
  adminWallet: string
): DisputeDecisionCriteria & { escrowId: string; adminWallet: string; timestamp: string } {
  return {
    escrowId,
    decision,
    reason,
    adminWallet,
    timestamp: new Date().toISOString(),
  };
}
