'use client'

import { useState, useEffect } from 'react'

interface FundWalletProps {
  walletAddress: string
  agentName: string
}

interface Balance {
  eth_formatted: string
  usdc_formatted: string
}

export default function FundWallet({ walletAddress, agentName }: FundWalletProps) {
  const [balance, setBalance] = useState<Balance | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetchBalance()
    // Poll balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000)
    return () => clearInterval(interval)
  }, [walletAddress])

  const fetchBalance = async () => {
    try {
      // Fetch balance from our API which reads from chain
      const res = await fetch(`/api/agents/balance?address=${walletAddress}`)
      if (res.ok) {
        const data = await res.json()
        setBalance(data)
      }
    } catch (err) {
      console.error('Failed to fetch balance:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const copyAddress = async () => {
    await navigator.clipboard.writeText(walletAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-6 bg-[#141210] border border-stone-800 rounded-lg">
      <h3 className="text-lg font-mono font-bold mb-4">Fund {agentName}</h3>

      {/* Current Balance */}
      <div className="mb-6 p-4 bg-[#1a1614] border border-stone-700 rounded">
        <p className="text-xs font-mono text-stone-500 uppercase tracking-wider mb-2">Current Balance</p>
        {isLoading ? (
          <p className="text-lg font-mono text-stone-400">Loading...</p>
        ) : balance ? (
          <div className="space-y-1">
            <p className="text-2xl font-mono font-bold text-[#c9a882]">{balance.usdc_formatted}</p>
            <p className="text-sm font-mono text-stone-500">{balance.eth_formatted}</p>
          </div>
        ) : (
          <p className="text-lg font-mono text-stone-400">$0.00 USDC</p>
        )}
      </div>

      {/* Wallet Address */}
      <div className="mb-6">
        <p className="text-xs font-mono text-stone-500 uppercase tracking-wider mb-2">Wallet Address</p>
        <div className="flex gap-2">
          <code className="flex-1 px-3 py-2 bg-[#1a1614] border border-stone-700 rounded font-mono text-sm text-stone-300 overflow-x-auto">
            {walletAddress}
          </code>
          <button
            onClick={copyAddress}
            className="px-3 py-2 bg-stone-800 text-stone-300 font-mono text-sm rounded hover:bg-stone-700 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-4">
        <div className="p-4 bg-yellow-900/20 border border-yellow-700/50 rounded">
          <h4 className="font-mono font-bold text-yellow-500 mb-2">How to Fund</h4>
          <ol className="space-y-2 text-sm font-mono text-yellow-200/70">
            <li className="flex gap-2">
              <span>1.</span>
              <span>Send USDC to the wallet address above</span>
            </li>
            <li className="flex gap-2">
              <span>2.</span>
              <span>Make sure you&apos;re on <strong>Base network</strong></span>
            </li>
            <li className="flex gap-2">
              <span>3.</span>
              <span>Balance updates automatically every 30 seconds</span>
            </li>
          </ol>
        </div>

        <div className="text-xs font-mono text-stone-500">
          <p className="mb-1"><strong>Base USDC Contract:</strong></p>
          <code className="text-stone-400">0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913</code>
        </div>

        <div className="flex gap-2">
          <a
            href={`https://basescan.org/address/${walletAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 px-4 py-2 border border-stone-700 text-stone-300 font-mono text-sm rounded hover:border-stone-500 transition-colors text-center"
          >
            View on BaseScan
          </a>
          <button
            onClick={fetchBalance}
            className="px-4 py-2 bg-stone-800 text-stone-300 font-mono text-sm rounded hover:bg-stone-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
