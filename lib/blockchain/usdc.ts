/**
 * USDC Helpers
 *
 * Per PRD Section 11 - lib/blockchain/usdc.ts
 * Common USDC operations for balance checking, transfers, and allowances
 */

import { createPublicClient, http, formatUnits, parseUnits, type Address } from 'viem';
import { base, baseSepolia } from 'viem/chains';

// USDC addresses
export const USDC_ADDRESS = {
  mainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  sepolia: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
};

// USDC has 6 decimals
export const USDC_DECIMALS = 6;

// Chain config
const isTestnet = process.env.NEXT_PUBLIC_CHAIN === 'sepolia';
export const CHAIN = isTestnet ? baseSepolia : base;
export const USDC = isTestnet ? USDC_ADDRESS.sepolia : USDC_ADDRESS.mainnet;

// ERC20 ABI for USDC
export const USDC_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'transferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const;

// Create public client
function getPublicClient() {
  return createPublicClient({
    chain: CHAIN,
    transport: http(process.env.ALCHEMY_BASE_URL),
  });
}

/**
 * Get USDC balance for an address (ON-CHAIN - TRUSTLESS)
 */
export async function getUSDCBalance(address: string): Promise<bigint> {
  const publicClient = getPublicClient();

  const balance = await publicClient.readContract({
    address: USDC,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: [address as Address],
  });

  return balance;
}

/**
 * Get formatted USDC balance (human-readable)
 */
export async function getFormattedUSDCBalance(address: string): Promise<string> {
  const balance = await getUSDCBalance(address);
  return formatUSDC(balance);
}

/**
 * Check USDC allowance for a spender
 */
export async function getUSDCAllowance(owner: string, spender: string): Promise<bigint> {
  const publicClient = getPublicClient();

  const allowance = await publicClient.readContract({
    address: USDC,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: [owner as Address, spender as Address],
  });

  return allowance;
}

/**
 * Check if address has sufficient USDC balance
 */
export async function hasSufficientBalance(address: string, requiredAmount: bigint): Promise<boolean> {
  const balance = await getUSDCBalance(address);
  return balance >= requiredAmount;
}

/**
 * Check if address has sufficient allowance for a spender
 */
export async function hasSufficientAllowance(
  owner: string,
  spender: string,
  requiredAmount: bigint
): Promise<boolean> {
  const allowance = await getUSDCAllowance(owner, spender);
  return allowance >= requiredAmount;
}

/**
 * Format USDC amount from wei (6 decimals) to human-readable
 */
export function formatUSDC(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

/**
 * Parse human-readable USDC amount to wei (6 decimals)
 */
export function parseUSDC(amount: string): bigint {
  return parseUnits(amount, USDC_DECIMALS);
}

/**
 * Verify a USDC transfer transaction on-chain
 * Used for Path B credit purchases
 */
export async function verifyUSDCTransfer(
  txHash: string,
  expectedTo: string,
  expectedAmount: bigint
): Promise<{
  valid: boolean;
  actualAmount?: bigint;
  actualTo?: string;
  from?: string;
  error?: string;
}> {
  const publicClient = getPublicClient();

  try {
    const receipt = await publicClient.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (!receipt) {
      return { valid: false, error: 'Transaction not found' };
    }

    if (receipt.status !== 'success') {
      return { valid: false, error: 'Transaction failed' };
    }

    // Check for Transfer event in logs
    const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === USDC.toLowerCase() && log.topics[0] === transferTopic) {
        const from = '0x' + log.topics[1]?.slice(26);
        const to = '0x' + log.topics[2]?.slice(26);
        const amount = BigInt(log.data);

        if (to?.toLowerCase() === expectedTo.toLowerCase()) {
          if (amount >= expectedAmount) {
            return {
              valid: true,
              actualAmount: amount,
              actualTo: to,
              from,
            };
          } else {
            return {
              valid: false,
              actualAmount: amount,
              actualTo: to,
              from,
              error: `Amount mismatch: expected ${formatUSDC(expectedAmount)}, got ${formatUSDC(amount)}`,
            };
          }
        }
      }
    }

    return { valid: false, error: 'USDC transfer to expected address not found in transaction' };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown error verifying transaction',
    };
  }
}
