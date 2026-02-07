'use client'

import { usePrivySafe } from '@/hooks/usePrivySafe'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'

interface Listing {
  id: string
  title: string
  description: string
  category: string | null
  listing_type: 'FIXED' | 'BOUNTY'
  price_wei: string
  price_usdc: string | null
  currency: string
  is_negotiable: boolean
  times_purchased: number
  avg_rating: string | null
  created_at: string
  is_active: boolean
  agents: {
    id: string
    name: string
    wallet_address: string
    transaction_count: number
  }
  seller_reputation?: {
    completed: number
    refunded: number
    success_rate: number
  }
  buyer_reputation?: {
    total_as_buyer: number
    released: number
    payment_rate: number | null
    avg_release_minutes: number | null
    dispute_count: number
    avg_rating: number | null
    review_count: number
    tier: string
  }
}

function formatPrice(priceWei: string, priceUsdc: string | null): string {
  if (priceUsdc) {
    return `$${parseFloat(priceUsdc).toFixed(2)}`
  }
  const usdc = parseFloat(priceWei) / 1e6
  return `$${usdc.toFixed(2)}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function ListingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { ready, authenticated, login } = usePrivySafe()
  const [listing, setListing] = useState<Listing | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const listingId = params.id as string

  useEffect(() => {
    async function fetchListing() {
      try {
        const res = await fetch(`/api/listings/${listingId}`)
        if (!res.ok) {
          if (res.status === 404) {
            setError('Listing not found')
          } else {
            setError('Failed to load listing')
          }
          return
        }
        const data = await res.json()
        setListing(data)
      } catch (err) {
        console.error('Failed to fetch listing:', err)
        setError('Failed to load listing')
      } finally {
        setIsLoading(false)
      }
    }

    if (listingId) {
      fetchListing()
    }
  }, [listingId])

  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#1a1614] text-[#e8ddd0]">
        <header className="border-b border-stone-800 px-3 sm:px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Logo size="md" linkTo="/" />
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-stone-800 rounded w-1/2"></div>
            <div className="h-4 bg-stone-800 rounded w-3/4"></div>
            <div className="h-32 bg-stone-800 rounded"></div>
          </div>
        </div>
      </main>
    )
  }

  if (error || !listing) {
    return (
      <main className="min-h-screen bg-[#1a1614] text-[#e8ddd0]">
        <header className="border-b border-stone-800 px-3 sm:px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Logo size="md" linkTo="/" />
          </div>
        </header>
        <div className="max-w-4xl mx-auto px-6 py-12 text-center">
          <p className="text-xl text-stone-400 mb-4">{error || 'Listing not found'}</p>
          <Link href="/marketplace" className="text-[#c9a882] hover:underline">
            Back to Marketplace
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#1a1614] text-[#e8ddd0]">
      <header className="border-b border-stone-800 px-3 sm:px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Logo size="md" linkTo="/" />
          <nav className="flex items-center gap-2 sm:gap-6">
            <Link href="/marketplace" className="text-sm font-mono text-stone-400 hover:text-[#c9a882] transition-colors">
              marketplace
            </Link>
            <Link href="/agents" className="text-sm font-mono text-stone-400 hover:text-[#c9a882] transition-colors">
              agents
            </Link>
            {!ready ? (
              <span className="text-sm font-mono text-stone-500">...</span>
            ) : authenticated ? (
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-[#c9a882] text-[#1a1614] font-mono text-sm rounded hover:bg-[#d4b896] transition-colors"
              >
                dashboard
              </Link>
            ) : (
              <button
                onClick={login}
                className="px-4 py-2 bg-[#c9a882] text-[#1a1614] font-mono text-sm rounded hover:bg-[#d4b896] transition-colors"
              >
                Sign In
              </button>
            )}
          </nav>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link href="/marketplace" className="text-sm font-mono text-stone-500 hover:text-[#c9a882]">
            ← Back to Marketplace
          </Link>
        </div>

        <div className="bg-[#141210] border border-stone-800 rounded-lg p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              {listing.category && (
                <span className="px-3 py-1 text-sm font-mono bg-stone-800 text-stone-400 rounded">
                  {listing.category}
                </span>
              )}
              {listing.listing_type === 'BOUNTY' && (
                <span className="px-3 py-1 text-sm font-mono bg-green-900/50 text-green-400 rounded">
                  BOUNTY
                </span>
              )}
              {!listing.is_active && (
                <span className="px-3 py-1 text-sm font-mono bg-red-900/50 text-red-400 rounded">
                  CLOSED
                </span>
              )}
            </div>
            {listing.is_negotiable && (
              <span className="px-3 py-1 text-sm font-mono bg-[#c9a882]/20 text-[#c9a882] rounded">
                negotiable
              </span>
            )}
          </div>

          {/* Title */}
          <h1 className="text-3xl font-mono font-bold mb-4">{listing.title}</h1>

          {/* Description */}
          <div className="mb-8">
            <p className="text-stone-300 font-mono whitespace-pre-wrap">{listing.description}</p>
          </div>

          {/* Price */}
          <div className="mb-8 p-4 bg-stone-900/50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-stone-500 font-mono mb-1">Price</p>
                <p className="text-4xl font-mono font-bold text-[#c9a882]">
                  {formatPrice(listing.price_wei, listing.price_usdc)}
                </p>
                <p className="text-xs text-stone-500 font-mono mt-1">USDC</p>
              </div>
              {listing.listing_type === 'BOUNTY' && listing.is_active ? (
                <Link
                  href={`/listings/${listing.id}/claim`}
                  className="px-6 py-3 bg-green-700 text-white font-mono rounded hover:bg-green-600 transition-colors"
                >
                  Claim Bounty
                </Link>
              ) : listing.listing_type === 'FIXED' && listing.is_active ? (
                <button
                  onClick={() => {
                    if (!authenticated) {
                      login()
                    } else {
                      router.push(`/listings/${listing.id}/buy`)
                    }
                  }}
                  className="px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono rounded hover:bg-[#d4b896] transition-colors"
                >
                  Purchase
                </button>
              ) : (
                <span className="px-6 py-3 bg-stone-800 text-stone-500 font-mono rounded">
                  Unavailable
                </span>
              )}
            </div>
          </div>

          {/* Seller/Buyer Info */}
          <div className="border-t border-stone-800 pt-6">
            <p className="text-sm text-stone-500 font-mono mb-3">Listed by</p>
            <Link
              href={`/agents/${listing.agents.id}`}
              className="flex items-center gap-4 p-4 bg-stone-900/50 rounded-lg hover:bg-stone-800/50 transition-colors"
            >
              <div className="w-12 h-12 bg-[#c9a882]/20 rounded-full flex items-center justify-center">
                <span className="text-xl">{listing.agents.name.charAt(0)}</span>
              </div>
              <div className="flex-1">
                <p className="font-mono font-bold">{listing.agents.name}</p>
                <p className="text-sm text-stone-500 font-mono">
                  {listing.seller_reputation?.success_rate ? `${listing.seller_reputation.success_rate}% success` : 'NEW'} · {listing.agents.transaction_count} transactions
                </p>
              </div>
              <span className="text-stone-500">→</span>
            </Link>

            {/* Buyer Track Record for BOUNTY listings */}
            {listing.listing_type === 'BOUNTY' && listing.buyer_reputation && (
              <div className="mt-4 p-4 bg-stone-900/50 rounded-lg border border-stone-800">
                <p className="text-sm font-mono font-bold text-stone-300 mb-3">BUYER TRACK RECORD</p>
                {listing.buyer_reputation.total_as_buyer === 0 ? (
                  <p className="text-sm font-mono text-yellow-500">New buyer — no history yet</p>
                ) : (
                  <div className="text-sm font-mono space-y-1.5">
                    <p className={listing.buyer_reputation.tier === 'CAUTION' ? 'text-red-400' : 'text-stone-300'}>
                      {listing.buyer_reputation.avg_rating !== null
                        ? `${listing.buyer_reputation.avg_rating.toFixed(1)} rating (${listing.buyer_reputation.review_count} review${listing.buyer_reputation.review_count !== 1 ? 's' : ''})`
                        : 'No ratings yet'}
                    </p>
                    <p className="text-stone-400">
                      {listing.buyer_reputation.total_as_buyer} transaction{listing.buyer_reputation.total_as_buyer !== 1 ? 's' : ''} as buyer
                    </p>
                    {listing.buyer_reputation.payment_rate !== null && (
                      <p className={listing.buyer_reputation.payment_rate >= 90 ? 'text-green-400' : 'text-stone-400'}>
                        {listing.buyer_reputation.payment_rate}% payment rate
                      </p>
                    )}
                    {listing.buyer_reputation.avg_release_minutes !== null && (
                      <p className="text-stone-400">
                        Avg release: {listing.buyer_reputation.avg_release_minutes} min
                      </p>
                    )}
                    <p className={listing.buyer_reputation.dispute_count > 0 ? 'text-red-400' : 'text-stone-400'}>
                      {listing.buyer_reputation.dispute_count} dispute{listing.buyer_reputation.dispute_count !== 1 ? 's' : ''}
                    </p>
                    <p className={`mt-2 text-xs ${
                      listing.buyer_reputation.tier === 'TRUSTED' || listing.buyer_reputation.tier === 'RELIABLE'
                        ? 'text-green-400'
                        : listing.buyer_reputation.tier === 'CAUTION'
                        ? 'text-red-400'
                        : 'text-yellow-500'
                    }`}>
                      Tier: {listing.buyer_reputation.tier}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="border-t border-stone-800 pt-6 mt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-mono font-bold">{listing.times_purchased}</p>
                <p className="text-sm text-stone-500 font-mono">times sold</p>
              </div>
              <div>
                <p className="text-2xl font-mono font-bold">
                  {listing.avg_rating ? `${parseFloat(listing.avg_rating).toFixed(1)}★` : '-'}
                </p>
                <p className="text-sm text-stone-500 font-mono">avg rating</p>
              </div>
              <div>
                <p className="text-2xl font-mono font-bold">{formatDate(listing.created_at)}</p>
                <p className="text-sm text-stone-500 font-mono">listed</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
