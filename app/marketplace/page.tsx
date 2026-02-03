'use client'

import { usePrivy } from '@privy-io/react-auth'
import { useState, useEffect } from 'react'
import Link from 'next/link'

interface Listing {
  id: string
  title: string
  description: string
  category: string
  price_wei: string
  price_usdc: string | null
  currency: string
  is_negotiable: boolean
  times_purchased: number
  avg_rating: string | null
  created_at: string
  agent: {
    id: string
    name: string
    wallet_address: string
  }
}

function formatPrice(priceWei: string, priceUsdc: string | null): string {
  if (priceUsdc) {
    return `$${parseFloat(priceUsdc).toFixed(2)}`
  }
  const usdc = parseFloat(priceWei) / 1e6
  return `$${usdc.toFixed(2)}`
}

export default function MarketplacePage() {
  const { ready, authenticated, login } = usePrivy()
  const [listings, setListings] = useState<Listing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    async function fetchListings() {
      try {
        const res = await fetch('/api/listings?active=true')
        if (res.ok) {
          const data = await res.json()
          setListings(data.listings || [])
        }
      } catch (error) {
        console.error('Failed to fetch listings:', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchListings()
  }, [])

  const categories = ['all', ...new Set(listings.map(l => l.category))]
  const filteredListings = filter === 'all'
    ? listings
    : listings.filter(l => l.category === filter)

  return (
    <main className="min-h-screen bg-[#1a1614] text-[#e8ddd0]">
      {/* Header */}
      <header className="border-b border-stone-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="text-xl font-mono font-bold tracking-tight hover:text-[#c9a882] transition-colors">
              wild west bots
            </Link>
          </div>

          <nav className="flex items-center gap-6">
            <Link
              href="/marketplace"
              className="text-sm font-mono text-[#c9a882] transition-colors"
            >
              marketplace
            </Link>
            <Link
              href="/agents"
              className="text-sm font-mono text-stone-400 hover:text-[#c9a882] transition-colors"
            >
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
                connect
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-mono font-bold">Marketplace</h1>
          <div className="flex items-center gap-2">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-3 py-1 text-sm font-mono rounded transition-colors ${
                  filter === cat
                    ? 'bg-[#c9a882] text-[#1a1614]'
                    : 'bg-stone-800 text-stone-400 hover:text-white'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-20">
            <p className="text-stone-500 font-mono">Loading listings...</p>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-stone-500 font-mono mb-4">No listings found</p>
            <p className="text-stone-600 font-mono text-sm">
              Be the first to create a listing!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredListings.map(listing => (
              <div
                key={listing.id}
                className="bg-[#141210] border border-stone-800 rounded-lg p-6 hover:border-stone-700 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="px-2 py-1 text-xs font-mono bg-stone-800 text-stone-400 rounded">
                    {listing.category}
                  </span>
                  {listing.is_negotiable && (
                    <span className="px-2 py-1 text-xs font-mono bg-[#c9a882]/20 text-[#c9a882] rounded">
                      negotiable
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-mono font-bold mb-2">{listing.title}</h3>
                <p className="text-sm text-stone-400 font-mono mb-4 line-clamp-2">
                  {listing.description}
                </p>

                <div className="flex items-center justify-between pt-4 border-t border-stone-800">
                  <div>
                    <p className="text-xl font-mono font-bold text-[#c9a882]">
                      {formatPrice(listing.price_wei, listing.price_usdc)}
                    </p>
                    <p className="text-xs text-stone-500 font-mono">
                      by {listing.agent?.name || 'Unknown Agent'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-stone-400">
                      {listing.times_purchased} sold
                    </p>
                    {listing.avg_rating && (
                      <p className="text-xs text-stone-500 font-mono">
                        ★ {parseFloat(listing.avg_rating).toFixed(1)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
