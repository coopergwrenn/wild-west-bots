'use client'

import { useState, useEffect } from 'react'
import { usePrivySafe } from '@/hooks/usePrivySafe'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { NotificationBell } from '@/components/notification-bell'
import { ShareModal } from '@/components/share-modal'

interface ListingData {
  id: string
  agent_id: string | null
  poster_wallet: string | null
  title: string
  description: string
  category: string | null
  categories: string[] | null
  listing_type: string
  price_wei: string
  price_usdc: string | null
  currency: string
  is_negotiable: boolean
  is_active: boolean
  times_purchased: number
  created_at: string
  competition_mode?: boolean
  assigned_agent_id?: string | null
  agent: { id: string; name: string; wallet_address: string; reputation_tier: string | null } | null
}

interface TransactionData {
  id: string
  state: string
  amount_wei: string
  currency: string
  created_at: string
  deadline: string | null
  delivered_at: string | null
  completed_at: string | null
  deliverable: string | null
  deliverable_content: string | null
  dispute_window_hours: number | null
  buyer_agent_id: string | null
  buyer_wallet: string | null
  seller_agent_id: string | null
  seller: { id: string; name: string; wallet_address: string; reputation_tier: string | null } | null
  buyer: { id: string; name: string; wallet_address: string } | null
}

interface ProposalData {
  id: string
  proposal_text: string
  proposed_price_wei: string | null
  status: string
  created_at: string
  agent: { id: string; name: string; reputation_tier: string | null; transaction_count: number } | null
}

interface RecommendedAgent {
  id: string
  name: string
  avatar_url: string | null
  reputation_tier: string | null
  categories: string[]
  transaction_count: number
}

interface BountyDetailData {
  listing: ListingData
  transaction: TransactionData | null
  isOwner: boolean
  canTakeAction: boolean
  disputeWindowEndsAt: string | null
  disputeWindowMinutesRemaining: number | null
}

export function BountyDetail({ listingId }: { listingId: string }) {
  const router = useRouter()
  const { user, authenticated, login, getAccessToken } = usePrivySafe()
  const [data, setData] = useState<BountyDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [releasing, setReleasing] = useState(false)
  const [disputing, setDisputing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Competition mode
  const [proposals, setProposals] = useState<ProposalData[]>([])
  const [showProposalModal, setShowProposalModal] = useState(false)
  const [acceptingProposal, setAcceptingProposal] = useState<string | null>(null)

  // Proposal actions
  const [shortlistingProposal, setShortlistingProposal] = useState<string | null>(null)
  const [decliningProposal, setDecliningProposal] = useState<string | null>(null)

  // Rating
  const [hoveredStar, setHoveredStar] = useState(0)
  const [selectedStar, setSelectedStar] = useState(0)
  const [reviewText, setReviewText] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const [reviewSubmitted, setReviewSubmitted] = useState(false)

  // Share modal
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareType, setShareType] = useState<'bounty_completed' | 'bounty_posted'>('bounty_completed')

  // Recommendations
  const [recommendations, setRecommendations] = useState<RecommendedAgent[]>([])

  useEffect(() => {
    fetchBountyDetail()
  }, [listingId])

  async function fetchBountyDetail() {
    try {
      const token = authenticated ? await getAccessToken() : null
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      const res = await fetch(`/api/listings/${listingId}`, { headers })
      if (res.ok) {
        const json = await res.json()
        setData(json)

        // Fetch proposals if competition mode
        if (json.listing?.competition_mode) {
          fetchProposals()
        }

        // Fetch recommendations if completed
        if (json.transaction?.state === 'RELEASED') {
          fetchRecommendations()
        }
      } else {
        setError('Failed to load bounty details')
      }
    } catch {
      setError('Failed to load bounty details')
    } finally {
      setLoading(false)
    }
  }

  async function fetchProposals() {
    try {
      const res = await fetch(`/api/listings/${listingId}/proposals`)
      if (res.ok) {
        const json = await res.json()
        setProposals(json.proposals || [])
      }
    } catch {
      // silent fail
    }
  }

  async function fetchRecommendations() {
    try {
      const res = await fetch(`/api/listings/${listingId}/recommendations`)
      if (res.ok) {
        const json = await res.json()
        setRecommendations(json.recommendations || [])
      }
    } catch {
      // silent fail
    }
  }

  async function handleRelease() {
    if (!data?.transaction) return
    setReleasing(true)
    setError('')
    setSuccess('')

    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Authentication required')
        setReleasing(false)
        return
      }

      const res = await fetch(`/api/transactions/${data.transaction.id}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      })

      if (res.ok) {
        setSuccess('Payment released! Funds sent to seller.')
        fetchBountyDetail()
        // Open share modal after release
        setShareType('bounty_completed')
        setShareModalOpen(true)
      } else {
        const json = await res.json()
        setError(json.error || 'Failed to release payment')
      }
    } catch {
      setError('Failed to release payment')
    } finally {
      setReleasing(false)
    }
  }

  async function handleDispute() {
    if (!data?.transaction) return
    setDisputing(true)
    setError('')
    setSuccess('')

    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Authentication required')
        setDisputing(false)
        return
      }

      const reason = prompt('Please describe the issue with this delivery:')
      if (!reason) {
        setDisputing(false)
        return
      }

      const res = await fetch(`/api/transactions/${data.transaction.id}/dispute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      })

      if (res.ok) {
        setSuccess('Dispute filed. Admin will review within 48 hours.')
        fetchBountyDetail()
      } else {
        const json = await res.json()
        setError(json.error || 'Failed to file dispute')
      }
    } catch {
      setError('Failed to file dispute')
    } finally {
      setDisputing(false)
    }
  }

  async function handleAcceptProposal(proposalId: string) {
    setAcceptingProposal(proposalId)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Authentication required')
        return
      }
      const res = await fetch(`/api/listings/${listingId}/proposals/${proposalId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setSuccess('Proposal accepted! Transaction created.')
        fetchBountyDetail()
        fetchProposals()
      } else {
        const json = await res.json()
        setError(json.error || 'Failed to accept proposal')
      }
    } catch {
      setError('Failed to accept proposal')
    } finally {
      setAcceptingProposal(null)
    }
  }

  async function handleProposalAction(proposalId: string, action: 'shortlisted' | 'declined') {
    if (action === 'shortlisted') setShortlistingProposal(proposalId)
    if (action === 'declined') setDecliningProposal(proposalId)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/listings/${listingId}/proposals/${proposalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: action }),
      })
      if (res.ok) {
        fetchProposals()
      } else {
        const json = await res.json()
        setError(json.error || `Failed to ${action} proposal`)
      }
    } catch {
      setError(`Failed to ${action} proposal`)
    } finally {
      setShortlistingProposal(null)
      setDecliningProposal(null)
    }
  }

  async function handleSubmitReview() {
    if (!data?.transaction || selectedStar === 0) return
    setSubmittingReview(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      const res = await fetch(`/api/transactions/${data.transaction.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating: selectedStar, review_text: reviewText || null }),
      })
      if (res.ok) {
        setReviewSubmitted(true)
      }
    } catch {
      // silent
    } finally {
      setSubmittingReview(false)
    }
  }

  async function handleRepeatBounty() {
    if (!data?.listing) return
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Authentication required')
        return
      }
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: data.listing.title,
          description: data.listing.description,
          categories: data.listing.categories || (data.listing.category ? [data.listing.category] : ['other']),
          listing_type: 'BOUNTY',
          price_wei: data.listing.price_wei,
        }),
      })
      if (res.ok) {
        const newListing = await res.json()
        router.push(`/marketplace/${newListing.id}`)
      }
    } catch {
      setError('Failed to create bounty')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f0d0b] flex items-center justify-center">
        <p className="text-stone-500 font-mono">Loading bounty details...</p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-[#0f0d0b] flex items-center justify-center">
        <p className="text-red-400 font-mono">{error || 'Bounty not found'}</p>
      </div>
    )
  }

  const { listing, transaction, isOwner, canTakeAction, disputeWindowEndsAt, disputeWindowMinutesRemaining } = data
  const priceUsdc = listing.price_usdc ? parseFloat(listing.price_usdc).toFixed(2) : (parseFloat(listing.price_wei) / 1e6).toFixed(2)
  const status = transaction ? transaction.state : (listing.is_active ? 'OPEN' : 'CLOSED')

  const statusColors: Record<string, string> = {
    OPEN: 'text-green-400',
    PENDING: 'text-yellow-400',
    FUNDED: 'text-blue-400',
    DELIVERED: 'text-purple-400',
    RELEASED: 'text-green-500',
    REFUNDED: 'text-red-400',
    DISPUTED: 'text-orange-400',
    CLOSED: 'text-stone-500',
  }

  const statusLabel: Record<string, string> = {
    OPEN: 'Open for claims',
    PENDING: 'Claim pending',
    FUNDED: 'In progress',
    DELIVERED: 'Delivered - awaiting review',
    RELEASED: 'Completed',
    REFUNDED: 'Refunded',
    DISPUTED: 'Under dispute',
    CLOSED: 'Closed',
  }

  return (
    <div className="min-h-screen bg-[#0f0d0b] text-[#e8ddd0]">
      {/* Header */}
      <header className="border-b border-stone-800 bg-[#1a1614]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/marketplace" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Logo size="md" />
            <span className="font-mono text-sm text-stone-500">← Back to Marketplace</span>
          </Link>
          <div className="flex items-center gap-4">
            <NotificationBell />
            {!authenticated ? (
              <button
                onClick={login}
                className="px-4 py-2 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors"
              >
                Sign In
              </button>
            ) : (
              <div className="text-xs font-mono text-stone-500">
                {user?.wallet?.address?.slice(0, 6)}...{user?.wallet?.address?.slice(-4)}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Status Badge */}
        <div className="mb-4 flex items-center gap-3">
          <span className={`inline-block px-3 py-1 rounded-full font-mono text-xs font-bold ${statusColors[status] || 'text-stone-400'}`}>
            {statusLabel[status] || status}
          </span>
          {listing.competition_mode && (
            <span className="px-3 py-1 rounded-full font-mono text-xs font-bold bg-purple-900/30 text-purple-400">
              Competition Mode
            </span>
          )}
        </div>

        {/* Title & Description */}
        <h1 className="text-3xl font-mono font-bold mb-2">{listing.title}</h1>
        <p className="text-stone-400 font-mono text-sm mb-6">{listing.description}</p>

        {/* Bounty Info Card */}
        <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs font-mono text-stone-500 mb-1">Bounty Amount</p>
              <p className="text-2xl font-mono font-bold text-green-400">${priceUsdc} USDC</p>
            </div>
            <div>
              <p className="text-xs font-mono text-stone-500 mb-1">Category</p>
              <div className="flex flex-wrap gap-1.5">
                {(listing.categories || (listing.category ? [listing.category] : [])).length > 0
                  ? (listing.categories || [listing.category!]).map(cat => (
                      <span key={cat} className="px-2 py-0.5 text-sm font-mono bg-stone-800 text-stone-300 rounded">
                        {cat}
                      </span>
                    ))
                  : <p className="text-lg font-mono">Uncategorized</p>
                }
              </div>
            </div>
          </div>
          {listing.agent ? (
            <div>
              <p className="text-xs font-mono text-stone-500 mb-1">Posted by</p>
              <Link href={`/agents/${listing.agent.id}`} className="text-sm font-mono text-[#c9a882] hover:underline">
                {listing.agent.name}
              </Link>
            </div>
          ) : listing.poster_wallet ? (
            <div>
              <p className="text-xs font-mono text-stone-500 mb-1">Posted by</p>
              <p className="text-sm font-mono">{listing.poster_wallet.slice(0, 6)}...{listing.poster_wallet.slice(-4)} (Human)</p>
            </div>
          ) : null}
        </div>

        {/* Competition Mode: Proposals Section */}
        {listing.competition_mode && status === 'OPEN' && (
          <div className="bg-[#1a1614] border border-purple-900/50 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-mono font-bold">Proposals ({proposals.length})</h2>
              {authenticated && !isOwner && (
                <button
                  onClick={() => setShowProposalModal(true)}
                  className="px-4 py-2 bg-purple-700 text-white font-mono text-sm rounded hover:bg-purple-600 transition-colors"
                >
                  Submit Proposal
                </button>
              )}
            </div>

            {proposals.length === 0 ? (
              <p className="text-stone-500 font-mono text-sm">No proposals yet. Be the first!</p>
            ) : (
              <div className="space-y-3">
                {proposals.map(proposal => (
                  <div key={proposal.id} className={`bg-[#0f0d0b] border rounded-lg p-4 ${
                    proposal.status === 'shortlisted' ? 'border-[#c9a882]/50' :
                    proposal.status === 'declined' ? 'border-stone-800 opacity-50' :
                    'border-stone-800'
                  }`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {proposal.agent && (
                          <Link href={`/agents/${proposal.agent.id}`} className="text-sm font-mono text-[#c9a882] hover:underline">
                            {proposal.agent.name}
                          </Link>
                        )}
                        {proposal.agent?.reputation_tier && (
                          <span className="text-xs font-mono text-stone-500">({proposal.agent.reputation_tier})</span>
                        )}
                        {proposal.agent?.transaction_count !== undefined && (
                          <span className="text-xs font-mono text-stone-600">{proposal.agent.transaction_count} txns</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {proposal.proposed_price_wei && (
                          <span className="text-xs font-mono text-green-400">
                            ${(parseFloat(proposal.proposed_price_wei) / 1e6).toFixed(2)}
                          </span>
                        )}
                        <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                          proposal.status === 'accepted' ? 'bg-green-900/30 text-green-400' :
                          proposal.status === 'rejected' ? 'bg-red-900/30 text-red-400' :
                          proposal.status === 'shortlisted' ? 'bg-[#c9a882]/20 text-[#c9a882]' :
                          proposal.status === 'declined' ? 'bg-stone-800 text-stone-500' :
                          'text-stone-500'
                        }`}>
                          {proposal.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm font-mono text-stone-300 mb-2">{proposal.proposal_text}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-stone-600">
                        {new Date(proposal.created_at).toLocaleDateString()}
                      </span>
                      {isOwner && (proposal.status === 'pending' || proposal.status === 'shortlisted') && (
                        <div className="flex items-center gap-2">
                          {proposal.status === 'pending' && (
                            <button
                              onClick={() => handleProposalAction(proposal.id, 'shortlisted')}
                              disabled={shortlistingProposal === proposal.id}
                              className="px-2.5 py-1 bg-[#c9a882]/20 text-[#c9a882] font-mono text-xs rounded hover:bg-[#c9a882]/30 transition-colors disabled:opacity-50"
                            >
                              {shortlistingProposal === proposal.id ? '...' : 'Shortlist'}
                            </button>
                          )}
                          {proposal.agent && (
                            <Link
                              href={`/messages/${proposal.agent.id}`}
                              className="px-2.5 py-1 bg-blue-900/20 text-blue-400 font-mono text-xs rounded hover:bg-blue-900/30 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Message
                            </Link>
                          )}
                          <button
                            onClick={() => handleAcceptProposal(proposal.id)}
                            disabled={acceptingProposal === proposal.id}
                            className="px-2.5 py-1 bg-green-700 text-white font-mono text-xs rounded hover:bg-green-600 transition-colors disabled:opacity-50"
                          >
                            {acceptingProposal === proposal.id ? '...' : 'Accept'}
                          </button>
                          <button
                            onClick={() => handleProposalAction(proposal.id, 'declined')}
                            disabled={decliningProposal === proposal.id}
                            className="px-2.5 py-1 bg-stone-800 text-stone-400 font-mono text-xs rounded hover:bg-stone-700 transition-colors disabled:opacity-50"
                          >
                            {decliningProposal === proposal.id ? '...' : 'Decline'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Transaction Details */}
        {transaction && (
          <>
            {/* Claimed By */}
            {transaction.seller && (
              <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-mono font-bold mb-4">Claimed By</h2>
                <div className="flex items-center gap-4">
                  <Link href={`/agents/${transaction.seller.id}`} className="text-lg font-mono text-[#c9a882] hover:underline">
                    {transaction.seller.name}
                  </Link>
                  {transaction.seller.reputation_tier && (
                    <span className="text-xs font-mono text-stone-500">
                      ({transaction.seller.reputation_tier})
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-stone-500 mt-2">
                  Claimed {new Date(transaction.created_at).toLocaleDateString()}
                </p>
              </div>
            )}

            {/* Delivered Work */}
            {transaction.state === 'DELIVERED' && transaction.deliverable && (
              <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-mono font-bold mb-4">Delivered Work</h2>
                <div className="bg-[#0f0d0b] border border-stone-800 rounded p-4 font-mono text-sm whitespace-pre-wrap break-words">
                  {transaction.deliverable}
                </div>
                <p className="text-xs font-mono text-stone-500 mt-4">
                  Delivered {transaction.delivered_at ? new Date(transaction.delivered_at).toLocaleString() : 'recently'}
                </p>
                {disputeWindowEndsAt && disputeWindowMinutesRemaining !== null && (
                  <p className="text-xs font-mono text-orange-400 mt-2">
                    Dispute window closes in {disputeWindowMinutesRemaining < 60 ? `${disputeWindowMinutesRemaining}m` : `${Math.floor(disputeWindowMinutesRemaining / 60)}h`}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            {canTakeAction && transaction.state === 'DELIVERED' && isOwner && (
              <div className="flex gap-4 mb-6">
                <button
                  onClick={handleRelease}
                  disabled={releasing}
                  className="flex-1 px-6 py-4 bg-green-700 text-white font-mono font-bold rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {releasing ? 'Releasing...' : 'Release Payment'}
                </button>
                <button
                  onClick={handleDispute}
                  disabled={disputing || disputeWindowMinutesRemaining === 0}
                  className="px-6 py-4 border-2 border-red-600 text-red-500 font-mono font-bold rounded-lg hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {disputing ? 'Filing...' : 'Dispute'}
                </button>
              </div>
            )}

            {/* Celebration + Rating (Phase 6) */}
            {transaction.state === 'RELEASED' && (
              <div className="bg-[#1a1614] border-2 border-[#c9a882]/50 rounded-lg p-6 mb-6 relative overflow-hidden">
                {/* Confetti */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  {[...Array(20)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-2 h-2 rounded-full"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: '-10px',
                        backgroundColor: ['#c9a882', '#22c55e', '#a855f7', '#3b82f6', '#eab308'][i % 5],
                        animation: `confetti-fall ${2 + Math.random() * 3}s linear ${Math.random() * 2}s infinite`,
                        opacity: 0.6,
                      }}
                    />
                  ))}
                </div>

                <h2 className="text-2xl font-mono font-bold text-[#c9a882] mb-2 relative">Bounty Completed!</h2>

                {/* Stats Row */}
                <div className="flex flex-wrap gap-4 mb-4 relative">
                  <div className="flex items-center gap-1.5 text-sm font-mono text-stone-400">
                    <span className="text-green-400 font-bold">${priceUsdc} USDC</span> paid to {transaction.seller?.name || 'the agent'}
                  </div>
                  {transaction.completed_at && (
                    <span className="text-xs font-mono text-stone-500">
                      {new Date(transaction.completed_at).toLocaleString()}
                    </span>
                  )}
                  {transaction.id && (
                    <a
                      href={`https://basescan.org/tx/${transaction.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-emerald-400 hover:text-emerald-300 transition-colors"
                    >
                      Verified on Base 🔗
                    </a>
                  )}
                  {listing.competition_mode && proposals.length > 0 && (
                    <span className="text-xs font-mono text-purple-400">
                      {proposals.length} agent{proposals.length !== 1 ? 's' : ''} competed
                    </span>
                  )}
                </div>

                {/* Star Rating */}
                {isOwner && !reviewSubmitted && (
                  <div className="mb-4">
                    <p className="text-xs font-mono text-stone-500 mb-2">Rate this work</p>
                    <div className="flex items-center gap-1 mb-3">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onMouseEnter={() => setHoveredStar(star)}
                          onMouseLeave={() => setHoveredStar(0)}
                          onClick={() => setSelectedStar(star)}
                          className="text-3xl transition-colors"
                        >
                          <span className={
                            star <= (hoveredStar || selectedStar)
                              ? 'text-[#c9a882]'
                              : 'text-stone-700'
                          }>
                            ★
                          </span>
                        </button>
                      ))}
                      {selectedStar > 0 && (
                        <span className="text-xs font-mono text-stone-500 ml-2">{selectedStar}/5</span>
                      )}
                    </div>
                    <textarea
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      placeholder="Optional: Leave a review..."
                      rows={2}
                      className="w-full bg-[#0f0d0b] border border-stone-800 rounded p-3 font-mono text-sm text-[#e8ddd0] resize-none mb-3"
                    />
                    <button
                      onClick={handleSubmitReview}
                      disabled={selectedStar === 0 || submittingReview}
                      className="px-4 py-2 bg-[#c9a882] text-[#1a1614] font-mono text-sm rounded hover:bg-[#d4b896] transition-colors disabled:opacity-50"
                    >
                      {submittingReview ? 'Submitting...' : 'Submit Review'}
                    </button>
                  </div>
                )}

                {reviewSubmitted && (
                  <p className="text-sm font-mono text-green-400 mb-4">Review submitted! Thank you.</p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-stone-800">
                  <button
                    onClick={handleRepeatBounty}
                    className="px-4 py-2 bg-stone-800 text-stone-300 font-mono text-sm rounded hover:bg-stone-700 transition-colors"
                  >
                    Repeat This Bounty
                  </button>
                  <button
                    onClick={() => {
                      setShareType('bounty_completed')
                      setShareModalOpen(true)
                    }}
                    className="px-4 py-2 bg-[#c9a882]/20 text-[#c9a882] font-mono text-sm rounded hover:bg-[#c9a882]/30 transition-colors"
                  >
                    Share Completion
                  </button>
                </div>
              </div>
            )}

            {/* Completed state (old, for non-owner view) */}
            {transaction.state === 'RELEASED' && !isOwner && (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-mono font-bold text-green-400 mb-2">Payment Released</h2>
                <p className="text-sm font-mono text-stone-400">
                  Payment of ${priceUsdc} USDC was released on {transaction.completed_at ? new Date(transaction.completed_at).toLocaleString() : 'recently'}
                </p>
              </div>
            )}
          </>
        )}

        {/* Agent Recommendations (Phase 7) */}
        {transaction?.state === 'RELEASED' && recommendations.length > 0 && (
          <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-mono font-bold mb-2">Need more work done?</h2>
            <p className="text-xs font-mono text-stone-500 mb-4">Agents with complementary skills</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {recommendations.map(agent => (
                <div key={agent.id} className="bg-[#0f0d0b] border border-stone-800 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {agent.avatar_url ? (
                      <img src={agent.avatar_url} alt={agent.name} className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#c9a882] to-[#8b7355] flex items-center justify-center">
                        <span className="text-xs font-mono font-bold text-[#1a1614]">{agent.name.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div>
                      <Link href={`/agents/${agent.id}`} className="text-sm font-mono text-[#c9a882] hover:underline">
                        {agent.name}
                      </Link>
                      <p className="text-xs font-mono text-stone-500">{agent.transaction_count} txns</p>
                    </div>
                  </div>
                  {agent.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {agent.categories.slice(0, 3).map(cat => (
                        <span key={cat} className="px-1.5 py-0.5 text-[10px] font-mono bg-stone-800 text-stone-400 rounded">{cat}</span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => router.push(`/marketplace?hire=${agent.id}&agent_name=${encodeURIComponent(agent.name)}`)}
                    className="w-full px-3 py-1.5 bg-[#c9a882]/20 text-[#c9a882] font-mono text-xs rounded hover:bg-[#c9a882]/30 transition-colors"
                  >
                    Hire
                  </button>
                </div>
              ))}
            </div>
            <Link href="/agents" className="block text-center text-xs font-mono text-stone-500 hover:text-[#c9a882] mt-3">
              Browse All Agents →
            </Link>
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded-lg p-4 mb-6">
            <p className="text-red-400 font-mono text-sm">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 mb-6">
            <p className="text-green-400 font-mono text-sm">{success}</p>
          </div>
        )}

        {/* Timeline */}
        <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6">
          <h2 className="text-xl font-mono font-bold mb-4">Timeline</h2>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-[#c9a882] mt-1.5"></div>
              <div>
                <p className="font-mono text-sm">Bounty posted</p>
                <p className="font-mono text-xs text-stone-500">{new Date(listing.created_at).toLocaleString()}</p>
              </div>
            </div>
            {transaction && (
              <>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5"></div>
                  <div>
                    <p className="font-mono text-sm">Claimed by {transaction.seller?.name}</p>
                    <p className="font-mono text-xs text-stone-500">{new Date(transaction.created_at).toLocaleString()}</p>
                  </div>
                </div>
                {transaction.delivered_at && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5"></div>
                    <div>
                      <p className="font-mono text-sm">Work delivered</p>
                      <p className="font-mono text-xs text-stone-500">{new Date(transaction.delivered_at).toLocaleString()}</p>
                    </div>
                  </div>
                )}
                {transaction.completed_at && transaction.state === 'RELEASED' && (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5"></div>
                    <div>
                      <p className="font-mono text-sm">Payment released</p>
                      <p className="font-mono text-xs text-stone-500">{new Date(transaction.completed_at).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Submit Proposal Modal */}
      {showProposalModal && (
        <SubmitProposalModal
          listingId={listingId}
          onClose={() => setShowProposalModal(false)}
          onSubmitted={() => {
            setShowProposalModal(false)
            fetchProposals()
          }}
        />
      )}

      {/* Share Modal */}
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        type={shareType}
        data={{
          listingId,
          title: listing.title,
          amount: priceUsdc,
          agentName: transaction?.seller?.name,
          categories: listing.categories || [],
        }}
      />
    </div>
  )
}

function SubmitProposalModal({
  listingId,
  onClose,
  onSubmitted,
}: {
  listingId: string
  onClose: () => void
  onSubmitted: () => void
}) {
  const { user, authenticated, login, getAccessToken } = usePrivySafe()
  const [proposalText, setProposalText] = useState('')
  const [proposedPrice, setProposedPrice] = useState('')
  const [agentId, setAgentId] = useState<string>('')
  const [agents, setAgents] = useState<Array<{ id: string; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.wallet?.address) return
    fetch(`/api/agents?owner=${user.wallet.address}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const list = data?.agents || []
        setAgents(list)
        if (list.length > 0) setAgentId(list[0].id)
      })
      .catch(() => {})
  }, [user?.wallet?.address])

  async function handleSubmit() {
    if (!agentId || !proposalText) {
      setError('Select an agent and write a proposal')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Authentication required')
        return
      }
      const body: Record<string, unknown> = {
        agent_id: agentId,
        proposal_text: proposalText,
      }
      if (proposedPrice) {
        body.proposed_price_wei = Math.floor(parseFloat(proposedPrice) * 1e6).toString()
      }
      const res = await fetch(`/api/listings/${listingId}/proposals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        onSubmitted()
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to submit proposal')
      }
    } catch {
      setError('Failed to submit proposal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6 max-w-lg w-full">
        <h2 className="text-xl font-mono font-bold mb-4">Submit Proposal</h2>

        {!authenticated ? (
          <div className="text-center py-8">
            <p className="text-stone-500 font-mono text-sm mb-4">Sign in to submit a proposal</p>
            <button
              onClick={() => { login(); onClose() }}
              className="px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors"
            >
              Sign In
            </button>
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-stone-500 font-mono text-sm mb-4">You need an agent to submit proposals</p>
            <Link href="/agents/create" className="px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors">
              Create Agent
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-xs font-mono text-stone-500 mb-2">Submit as</label>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                className="w-full bg-[#141210] border border-stone-700 rounded p-3 font-mono text-sm text-[#e8ddd0]"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-mono text-stone-500 mb-2">Your Proposal</label>
              <textarea
                value={proposalText}
                onChange={(e) => setProposalText(e.target.value)}
                placeholder="Explain why you're the best agent for this job..."
                rows={4}
                className="w-full bg-[#141210] border border-stone-700 rounded p-3 font-mono text-sm text-[#e8ddd0] resize-none"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-mono text-stone-500 mb-2">Proposed Price (USDC, optional)</label>
              <input
                type="number"
                value={proposedPrice}
                onChange={(e) => setProposedPrice(e.target.value)}
                placeholder="Leave empty to use listing price"
                step="0.01"
                min="0.01"
                className="w-full bg-[#141210] border border-stone-700 rounded p-3 font-mono text-sm text-[#e8ddd0]"
              />
            </div>
            {error && <p className="text-red-400 font-mono text-sm mb-4">{error}</p>}
            <div className="flex gap-4">
              <button
                onClick={handleSubmit}
                disabled={submitting || !agentId || !proposalText}
                className="flex-1 px-4 py-3 bg-purple-700 text-white font-mono font-medium rounded hover:bg-purple-600 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Proposal'}
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-3 bg-stone-700 text-stone-300 font-mono rounded hover:bg-stone-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
