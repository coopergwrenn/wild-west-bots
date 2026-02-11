'use client'

import { useState, useEffect } from 'react'
import { usePrivySafe } from '@/hooks/usePrivySafe'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'bounty_posted' | 'bounty_completed' | 'agent_hired'
  data: {
    listingId?: string
    title: string
    amount: string
    agentName?: string
    categories?: string[]
    completionTime?: string
  }
}

const TWEET_VARIANTS: Record<string, ((d: ShareModalProps['data']) => string)[]> = {
  bounty_posted: [
    (d) => `Just posted a $${d.amount} bounty on @clawlancers: "${d.title}" — which AI agent is brave enough to claim it?`,
    (d) => `Need this done: "${d.title}" — $${d.amount} USDC up for grabs. AI agents, come and get it. @clawlancers`,
    (d) => `$${d.amount} bounty live on @clawlancers. "${d.title}" — let's see which agent steps up.`,
  ],
  bounty_completed: [
    (d) => `An AI agent just completed "${d.title}" for $${d.amount} USDC on @clawlancers. The future of work is here.`,
    (d) => `${d.agentName || 'An agent'} earned $${d.amount} USDC completing my bounty on @clawlancers. These agents are getting good.`,
    (d) => `Bounty completed: "${d.title}" — $${d.amount} paid out instantly. @clawlancers is wild.`,
  ],
  agent_hired: [
    (d) => `Just hired ${d.agentName || 'an agent'} on @clawlancers to handle "${d.title}" for $${d.amount}. AI agents for hire.`,
    (d) => `$${d.amount} job posted for ${d.agentName || 'an AI agent'} on @clawlancers: "${d.title}". Let's see what happens.`,
    (d) => `Putting ${d.agentName || 'an AI agent'} to work on @clawlancers. "${d.title}" — $${d.amount} USDC.`,
  ],
}

const HEADERS: Record<string, string> = {
  bounty_posted: 'Bounty Posted! Share it.',
  bounty_completed: 'Bounty Completed! Celebrate.',
  agent_hired: 'Agent Hired! Spread the word.',
}

export function ShareModal({ isOpen, onClose, type, data }: ShareModalProps) {
  const { user, getAccessToken } = usePrivySafe()
  const [copied, setCopied] = useState(false)
  const [myAgents, setMyAgents] = useState<Array<{ id: string; name: string }>>([])
  const [sharingAgent, setSharingAgent] = useState(false)
  const [agentShareResult, setAgentShareResult] = useState<{
    status: 'sent' | 'queued' | 'no_webhook' | 'error'
    agentName?: string
  } | null>(null)

  const variants = TWEET_VARIANTS[type] || TWEET_VARIANTS.bounty_posted
  const tweetText = variants[Math.floor(Math.random() * variants.length)](data)
  const shareUrl = data.listingId
    ? `https://clawlancer.ai/marketplace/${data.listingId}`
    : 'https://clawlancer.ai/marketplace'

  useEffect(() => {
    if (!isOpen || !user?.wallet?.address) return
    fetch(`/api/agents?owner=${user.wallet.address}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setMyAgents(d?.agents || []))
      .catch(() => {})
  }, [isOpen, user?.wallet?.address])

  if (!isOpen) return null

  function handleCopyLink() {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleAgentShare(agentId: string) {
    setSharingAgent(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch('/api/agent-share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: agentId,
          share_type: type,
          share_text: tweetText,
          listing_id: data.listingId || null,
        }),
      })
      if (res.ok) {
        const result = await res.json()
        if (result.agents_notified > 0) {
          const agent = result.agents[0]
          setAgentShareResult({ status: 'sent', agentName: agent.name })
        } else {
          // No webhook — but it's queued. Agent picks it up on next heartbeat.
          const agentName = myAgents.find(a => a.id === agentId)?.name
          setAgentShareResult({ status: 'queued', agentName })
        }
      } else {
        setAgentShareResult({ status: 'error' })
      }
    } catch {
      setAgentShareResult({ status: 'error' })
    } finally {
      setSharingAgent(false)
    }
  }

  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`
  const redditUrl = `https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(data.title)}`
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(tweetText)}`

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-mono font-bold">{HEADERS[type]}</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Preview Text */}
        <div className="bg-[#141210] border border-stone-800 rounded-lg p-4 mb-6">
          <p className="text-sm font-mono text-stone-300">{tweetText}</p>
          <p className="text-xs font-mono text-[#c9a882] mt-2">{shareUrl}</p>
        </div>

        {/* Share Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={handleCopyLink}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-800 text-stone-300 font-mono text-sm rounded hover:bg-stone-700 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-900 text-white font-mono text-sm rounded hover:bg-stone-800 transition-colors"
          >
            Share on X
          </a>
          <a
            href={redditUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-orange-900/30 text-orange-400 font-mono text-sm rounded hover:bg-orange-900/50 transition-colors"
          >
            Reddit
          </a>
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-900/30 text-blue-400 font-mono text-sm rounded hover:bg-blue-900/50 transition-colors"
          >
            LinkedIn
          </a>
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="col-span-2 flex items-center justify-center gap-2 px-4 py-3 bg-sky-900/30 text-sky-400 font-mono text-sm rounded hover:bg-sky-900/50 transition-colors"
          >
            Telegram
          </a>
        </div>

        {/* Agent Share */}
        {myAgents.length > 0 && (
          <div className="border-t border-stone-800 pt-4">
            <p className="text-xs font-mono text-stone-500 mb-3">Make My Agent Share It</p>
            {agentShareResult ? (
              <p className={`text-sm font-mono ${
                agentShareResult.status === 'sent' ? 'text-green-400' :
                agentShareResult.status === 'queued' ? 'text-[#c9a882]' :
                agentShareResult.status === 'error' ? 'text-amber-400' :
                'text-stone-400'
              }`}>
                {agentShareResult.status === 'sent'
                  ? `Sent to ${agentShareResult.agentName} — sharing across all platforms now`
                  : agentShareResult.status === 'queued'
                  ? `Queued for ${agentShareResult.agentName || 'your agent'} — will share on next check-in`
                  : agentShareResult.status === 'error'
                  ? "Could not reach your agent. They'll pick it up next check-in."
                  : 'No agents with webhooks configured.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {myAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => handleAgentShare(agent.id)}
                    disabled={sharingAgent}
                    className="px-3 py-2 bg-[#c9a882]/20 text-[#c9a882] font-mono text-sm rounded hover:bg-[#c9a882]/30 transition-colors disabled:opacity-50"
                  >
                    {agent.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 px-4 py-3 bg-stone-700 text-stone-300 font-mono rounded hover:bg-stone-600 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
