'use client'

import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import Link from 'next/link'

const PERSONALITIES = [
  {
    id: 'hustler',
    name: 'Hustler',
    emoji: '💰',
    description: 'Aggressive deal-maker. Maximizes profit, negotiates hard, moves fast.',
    traits: ['High risk tolerance', 'Quick decisions', 'Profit-focused'],
  },
  {
    id: 'cautious',
    name: 'Cautious',
    emoji: '🛡️',
    description: 'Conservative trader. Preserves capital, waits for high-confidence deals.',
    traits: ['Low risk tolerance', 'Thorough research', 'Quality over quantity'],
  },
  {
    id: 'degen',
    name: 'Degen',
    emoji: '🎰',
    description: 'High-risk, high-reward. YOLOs into interesting opportunities.',
    traits: ['Maximum risk', 'Entertainment value', 'Big swings'],
  },
  {
    id: 'random',
    name: 'Wildcard',
    emoji: '🎲',
    description: 'Chaotic neutral. Unpredictable, surprising, creates interesting content.',
    traits: ['Unpredictable', 'Creative', 'Entertaining'],
  },
]

interface CreatedAgent {
  id: string
  name: string
  wallet_address: string
  personality: string
}

export default function CreateAgentFlow() {
  const { ready, authenticated, login, getAccessToken } = usePrivy()
  const [step, setStep] = useState<'name' | 'personality' | 'creating' | 'success'>('name')
  const [agentName, setAgentName] = useState('')
  const [selectedPersonality, setSelectedPersonality] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [createdAgent, setCreatedAgent] = useState<CreatedAgent | null>(null)

  const handleCreateAgent = async () => {
    if (!agentName || !selectedPersonality) return

    setStep('creating')
    setError(null)

    try {
      const token = await getAccessToken()

      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: agentName,
          personality: selectedPersonality,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create agent')
      }

      setCreatedAgent(data)
      setStep('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
      setStep('personality')
    }
  }

  if (!ready) {
    return (
      <div className="text-center py-12">
        <p className="text-stone-500 font-mono">Loading...</p>
      </div>
    )
  }

  if (!authenticated) {
    return (
      <div className="text-center py-12">
        <h2 className="text-2xl font-mono font-bold mb-4">Connect to Create an Agent</h2>
        <p className="text-stone-400 font-mono mb-6">
          Sign in with your wallet to create a hosted AI agent.
        </p>
        <button
          onClick={login}
          className="px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors"
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  // Step 1: Name
  if (step === 'name') {
    return (
      <div className="max-w-xl mx-auto">
        <h2 className="text-2xl font-mono font-bold mb-2">Name Your Agent</h2>
        <p className="text-stone-400 font-mono mb-6">
          Choose a name that represents your agent in the marketplace.
        </p>

        <div className="mb-6">
          <input
            type="text"
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder="e.g., TradeMaster_9000"
            maxLength={50}
            className="w-full px-4 py-3 bg-[#141210] border border-stone-700 rounded font-mono text-[#e8ddd0] placeholder-stone-600 focus:outline-none focus:border-[#c9a882] transition-colors"
          />
          <p className="mt-2 text-xs font-mono text-stone-500">
            {agentName.length}/50 characters
          </p>
        </div>

        <button
          onClick={() => setStep('personality')}
          disabled={!agentName.trim()}
          className="w-full px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next: Choose Personality
        </button>
      </div>
    )
  }

  // Step 2: Personality
  if (step === 'personality') {
    return (
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => setStep('name')}
          className="text-sm font-mono text-stone-500 hover:text-stone-300 mb-4 flex items-center gap-1"
        >
          ← Back
        </button>

        <h2 className="text-2xl font-mono font-bold mb-2">Choose a Personality</h2>
        <p className="text-stone-400 font-mono mb-6">
          This determines how your agent makes decisions in the marketplace.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded">
            <p className="text-sm font-mono text-red-400">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {PERSONALITIES.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPersonality(p.id)}
              className={`p-6 bg-[#141210] border rounded-lg text-left transition-all ${
                selectedPersonality === p.id
                  ? 'border-[#c9a882] ring-1 ring-[#c9a882]'
                  : 'border-stone-800 hover:border-stone-700'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">{p.emoji}</span>
                <span className="font-mono font-bold text-lg">{p.name}</span>
              </div>
              <p className="text-sm font-mono text-stone-400 mb-3">{p.description}</p>
              <div className="flex flex-wrap gap-2">
                {p.traits.map((trait) => (
                  <span
                    key={trait}
                    className="px-2 py-1 text-xs font-mono bg-stone-800 text-stone-400 rounded"
                  >
                    {trait}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-4">
          <button
            onClick={() => setStep('name')}
            className="flex-1 px-6 py-3 border border-stone-700 text-stone-300 font-mono rounded hover:border-stone-500 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleCreateAgent}
            disabled={!selectedPersonality}
            className="flex-1 px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Agent
          </button>
        </div>
      </div>
    )
  }

  // Step 3: Creating
  if (step === 'creating') {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <div className="animate-pulse mb-6">
          <div className="w-16 h-16 mx-auto bg-[#c9a882]/20 rounded-full flex items-center justify-center">
            <span className="text-3xl">🤖</span>
          </div>
        </div>
        <h2 className="text-2xl font-mono font-bold mb-2">Creating Your Agent...</h2>
        <p className="text-stone-400 font-mono">
          Setting up wallet and initializing {agentName}
        </p>
      </div>
    )
  }

  // Step 4: Success
  if (step === 'success' && createdAgent) {
    const personality = PERSONALITIES.find((p) => p.id === createdAgent.personality)

    return (
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-900/20 border border-green-800 rounded-full mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-mono font-bold mb-2">Agent Created!</h2>
          <p className="text-stone-400 font-mono">
            {createdAgent.name} is ready to enter the arena.
          </p>
        </div>

        <div className="p-6 bg-[#141210] border border-stone-800 rounded-lg mb-6">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-3xl">{personality?.emoji}</span>
            <div>
              <h3 className="font-mono font-bold text-lg">{createdAgent.name}</h3>
              <p className="text-sm font-mono text-stone-500">{personality?.name} personality</p>
            </div>
          </div>

          <div className="space-y-3 text-sm font-mono">
            <div className="flex justify-between">
              <span className="text-stone-500">Agent ID</span>
              <span className="text-stone-300">{createdAgent.id.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Wallet</span>
              <a
                href={`https://basescan.org/address/${createdAgent.wallet_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#c9a882] hover:underline"
              >
                {createdAgent.wallet_address.slice(0, 10)}...{createdAgent.wallet_address.slice(-8)}
              </a>
            </div>
          </div>
        </div>

        <div className="p-6 bg-yellow-900/20 border border-yellow-700 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">💰</span>
            <div>
              <h3 className="font-mono font-bold text-yellow-500 mb-1">Fund Your Agent</h3>
              <p className="text-sm font-mono text-yellow-200/70 mb-3">
                Send USDC to your agent&apos;s wallet on Base to start trading.
              </p>
              <code className="block p-3 bg-[#1a1614] border border-stone-700 rounded text-xs font-mono text-stone-300 break-all">
                {createdAgent.wallet_address}
              </code>
              <p className="mt-2 text-xs font-mono text-stone-500">
                USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-4">
          <Link
            href="/dashboard"
            className="flex-1 px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors text-center"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/marketplace"
            className="flex-1 px-6 py-3 border border-stone-700 text-stone-300 font-mono rounded hover:border-stone-500 transition-colors text-center"
          >
            Browse Marketplace
          </Link>
        </div>
      </div>
    )
  }

  return null
}
