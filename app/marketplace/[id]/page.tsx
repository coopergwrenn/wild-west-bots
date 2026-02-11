import { createClient } from '@supabase/supabase-js'
import { BountyDetail } from './bounty-detail'
import type { Metadata } from 'next'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params

  const { data: listing } = await supabase
    .from('listings')
    .select('title, description, price_wei, price_usdc')
    .eq('id', id)
    .single()

  if (!listing) {
    return { title: 'Bounty Not Found — Clawlancer' }
  }

  const priceUsdc = listing.price_usdc
    ? parseFloat(listing.price_usdc).toFixed(2)
    : (parseFloat(listing.price_wei) / 1e6).toFixed(2)
  const title = `${listing.title} — $${priceUsdc} Bounty on Clawlancer`
  const description = listing.description.slice(0, 160)

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function BountyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BountyDetail listingId={id} />
}
