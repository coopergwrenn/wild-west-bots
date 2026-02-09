/**
 * Coinbase Developer Platform (CDP) Smart Wallet Client
 *
 * Uses the official @coinbase/cdp-sdk which handles JWT auth internally.
 * Reference: https://docs.cdp.coinbase.com
 */

import { CdpClient } from '@coinbase/cdp-sdk'

let _client: InstanceType<typeof CdpClient> | null = null

function getClient(): InstanceType<typeof CdpClient> {
  if (!_client) {
    const apiKeyId = process.env.CDP_API_KEY_ID
    const apiKeySecret = process.env.CDP_API_KEY_SECRET
    const walletSecret = process.env.CDP_WALLET_SECRET

    if (!apiKeyId || !apiKeySecret) {
      throw new Error('CDP_API_KEY_ID and CDP_API_KEY_SECRET must be set')
    }

    _client = new CdpClient({
      apiKeyId,
      apiKeySecret,
      walletSecret: walletSecret || undefined,
    })
  }
  return _client
}

/**
 * Create a new CDP EVM account (server-managed key).
 * Returns the account address — this is the agent's wallet.
 */
export async function createCdpWallet(): Promise<{ walletId: string; address: string }> {
  const cdp = getClient()

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('CDP wallet creation timed out after 15s')), 15_000)
  )
  const account = await Promise.race([cdp.evm.createAccount(), timeout])

  if (!account?.address || !/^0x[a-fA-F0-9]{40}$/.test(account.address)) {
    throw new Error(`CDP returned invalid account address: ${account?.address}`)
  }

  return {
    walletId: account.address, // CDP SDK uses address as the account identifier
    address: account.address,
  }
}

/**
 * Get the address for a CDP account
 */
export async function getCdpWalletAddress(addressOrName: string): Promise<string> {
  const cdp = getClient()
  const account = await cdp.evm.getAccount({ address: addressOrName as `0x${string}` })
  return account.address
}

/**
 * Get USDC balance for a CDP account on Base
 */
export async function getCdpBalance(address: string): Promise<string> {
  const cdp = getClient()
  const result = await cdp.evm.listTokenBalances({
    address: address as `0x${string}`,
    network: 'base',
  })

  const usdcBalance = result.balances.find(
    (b: { token: { contractAddress?: string } }) =>
      b.token.contractAddress?.toLowerCase() === '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
  )
  return usdcBalance ? String(usdcBalance.amount) : '0'
}

/**
 * Check if CDP credentials are configured
 */
export function isCdpConfigured(): boolean {
  return !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET && process.env.CDP_WALLET_SECRET)
}

/**
 * Validate a CDP wallet address format (standard 0x address)
 */
export function isValidCdpWalletId(walletId: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(walletId)
}
