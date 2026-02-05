'use client'

import { useState, useEffect } from 'react'

const DEXSCREENER_PAIR = 'v1rwbx1qylmxex4k4p3auevmfemja8arqvgcyrrzlvb'
const DEXSCREENER_URL = `https://dexscreener.com/solana/${DEXSCREENER_PAIR}`
const API_URL = `https://api.dexscreener.com/latest/dex/pairs/solana/${DEXSCREENER_PAIR}`
const REFRESH_INTERVAL = 30000

interface TokenData {
  price: string
  priceChange: { h1: number; h6: number; h24: number }
  volume24h: number
  marketCap: number
  liquidity: number
  txns24h: { buys: number; sells: number }
}

function formatPrice(price: string): string {
  const num = parseFloat(price)
  if (num >= 1) return `$${num.toFixed(2)}`
  if (num >= 0.01) return `$${num.toFixed(4)}`
  return `$${num.toFixed(6)}`
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

function ChangeDisplay({ value, label }: { value: number; label: string }) {
  const isPositive = value >= 0
  return (
    <span className="flex items-center gap-1">
      <span className="text-stone-500">{label}</span>
      <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
        {isPositive ? '+' : ''}{value.toFixed(1)}%
      </span>
    </span>
  )
}

export function TokenTicker() {
  const [data, setData] = useState<TokenData | null>(null)

  useEffect(() => {
    async function fetchPrice() {
      try {
        const res = await fetch(API_URL)
        if (!res.ok) return
        const json = await res.json()
        const pair = json.pair || json.pairs?.[0]
        if (!pair) return
        setData({
          price: pair.priceUsd,
          priceChange: {
            h1: pair.priceChange?.h1 ?? 0,
            h6: pair.priceChange?.h6 ?? 0,
            h24: pair.priceChange?.h24 ?? 0,
          },
          volume24h: pair.volume?.h24 ?? 0,
          marketCap: pair.marketCap ?? pair.fdv ?? 0,
          liquidity: pair.liquidity?.usd ?? 0,
          txns24h: {
            buys: pair.txns?.h24?.buys ?? 0,
            sells: pair.txns?.h24?.sells ?? 0,
          },
        })
      } catch {
        // Silent fail
      }
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  if (!data) return null

  const items = (
    <>
      <a
        href={DEXSCREENER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 hover:text-white transition-colors shrink-0"
      >
        <span className="font-bold text-[#c9a882]">$CLAW</span>
        <span className="text-stone-200">{formatPrice(data.price)}</span>
      </a>

      <span className="text-stone-700 shrink-0">|</span>

      <ChangeDisplay value={data.priceChange.h1} label="1H" />

      <span className="text-stone-700 shrink-0">|</span>

      <ChangeDisplay value={data.priceChange.h6} label="6H" />

      <span className="text-stone-700 shrink-0">|</span>

      <ChangeDisplay value={data.priceChange.h24} label="24H" />

      <span className="text-stone-700 shrink-0">|</span>

      <span className="flex items-center gap-1 shrink-0">
        <span className="text-stone-500">MCap</span>
        <span className="text-stone-300">{formatCompact(data.marketCap)}</span>
      </span>

      <span className="text-stone-700 shrink-0">|</span>

      <span className="flex items-center gap-1 shrink-0">
        <span className="text-stone-500">Vol</span>
        <span className="text-stone-300">{formatCompact(data.volume24h)}</span>
      </span>

      <span className="text-stone-700 shrink-0">|</span>

      <span className="flex items-center gap-1 shrink-0">
        <span className="text-stone-500">Liq</span>
        <span className="text-stone-300">{formatCompact(data.liquidity)}</span>
      </span>

      <span className="text-stone-700 shrink-0">|</span>

      <span className="flex items-center gap-1 shrink-0">
        <span className="text-stone-500">Txns</span>
        <span className="text-green-400">{data.txns24h.buys}B</span>
        <span className="text-stone-600">/</span>
        <span className="text-red-400">{data.txns24h.sells}S</span>
      </span>
    </>
  )

  return (
    <div className="bg-[#12100e] border-b border-stone-800/50 overflow-hidden">
      <div className="relative flex">
        <div className="flex items-center gap-4 py-1.5 px-4 text-xs font-mono animate-ticker whitespace-nowrap">
          {items}
          <span className="text-stone-700 shrink-0">|</span>
          {items}
        </div>
      </div>
    </div>
  )
}
