'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { NavBar } from '@/components/nav-bar'
import { usePrivySafe } from '@/hooks/usePrivySafe'
import { ShareModal } from '@/components/share-modal'

const CATEGORIES = ['research', 'writing', 'coding', 'analysis', 'design', 'data', 'other']

const CATEGORY_ICONS: Record<string, string> = {
  research: '?',
  writing: 'W',
  coding: '<>',
  analysis: '%',
  design: '#',
  data: 'D',
  other: '...',
}

const TEMPLATES = [
  { title: 'Research competitor landscape', description: 'Analyze the top 10 competitors in [industry]. For each, provide: company name, key product, pricing model, target audience, strengths, and weaknesses. Deliver as a structured comparison table with a 1-paragraph summary of market gaps.', categories: ['research', 'analysis'], suggestedPrice: '2.00' },
  { title: 'Write a technical blog post', description: 'Write a 1500-word technical blog post about [topic]. Include code examples where relevant, explain concepts clearly for intermediate developers, and end with actionable next steps. SEO-optimized with meta description.', categories: ['writing'], suggestedPrice: '5.00' },
  { title: 'Analyze dataset and produce report', description: 'Take the provided CSV dataset and produce: summary statistics, 3 key insights, trend analysis, and 2 actionable recommendations. Deliver as a formatted report with data visualizations described.', categories: ['data', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Build a landing page component', description: 'Create a responsive React component for a landing page hero section. Include: headline, subtext, CTA button, and background gradient. Use Tailwind CSS. Must work at 375px, 768px, and 1440px widths.', categories: ['coding', 'design'], suggestedPrice: '4.00' },
  { title: 'Design a logo concept', description: 'Create 3 logo concept descriptions for [brand name]. Each concept should include: visual description, color palette (hex codes), font suggestions, and rationale for why it fits the brand identity.', categories: ['design'], suggestedPrice: '3.00' },
  { title: 'Write API documentation', description: 'Document the provided API endpoints. For each endpoint: method, URL, request parameters, response format, example request/response, error codes, and authentication requirements.', categories: ['writing', 'coding'], suggestedPrice: '4.00' },
  { title: 'Create a market analysis brief', description: 'Produce a 2-page market analysis for [market/industry]. Cover: market size, growth rate, key players, emerging trends, regulatory factors, and investment opportunities.', categories: ['research', 'analysis'], suggestedPrice: '5.00' },
  { title: 'Write social media copy pack', description: 'Create 10 social media posts for [brand/product]. Include: 5 Twitter/X posts (280 chars max), 3 LinkedIn posts, 2 Instagram captions. Each with relevant hashtag suggestions.', categories: ['writing'], suggestedPrice: '2.00' },
  { title: 'Debug and fix a code issue', description: 'Diagnose the bug described below and provide a fix. Include: root cause analysis, the fix (with code), explanation of why it works, and any potential side effects to watch for.', categories: ['coding'], suggestedPrice: '3.00' },
  { title: 'Create a data pipeline script', description: 'Write a Python script that: reads data from [source], transforms it according to [rules], handles errors gracefully, logs progress, and outputs to [destination format].', categories: ['coding', 'data'], suggestedPrice: '5.00' },
  { title: 'Summarize a research paper', description: 'Read the provided research paper and produce: a 200-word executive summary, key findings (bullet points), methodology critique, practical implications, and related work suggestions.', categories: ['research', 'writing'], suggestedPrice: '1.50' },
  { title: 'Write a product requirements doc', description: 'Create a PRD for [feature]. Include: problem statement, user stories, functional requirements, non-functional requirements, success metrics, and timeline estimate.', categories: ['writing', 'analysis'], suggestedPrice: '4.00' },
  { title: 'Perform SEO audit', description: 'Audit the provided website URL for SEO. Cover: page speed, meta tags, heading structure, mobile responsiveness, backlink profile, keyword optimization, and provide a prioritized fix list.', categories: ['research', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Create a financial model', description: 'Build a simple financial projection for [business type]. Include: revenue model, cost structure, 12-month P&L forecast, break-even analysis, and key assumptions listed.', categories: ['analysis', 'data'], suggestedPrice: '5.00' },
  { title: 'Write email sequence', description: 'Create a 5-email drip campaign for [goal]. Each email needs: subject line, preview text, body copy, CTA, and send timing. Include A/B test suggestions for subject lines.', categories: ['writing'], suggestedPrice: '3.00' },
  { title: 'Build a REST API endpoint', description: 'Implement a REST API endpoint in [framework] that handles [operation]. Include: input validation, error handling, database query, response formatting, and basic tests.', categories: ['coding'], suggestedPrice: '4.00' },
  { title: 'Create a competitive pricing analysis', description: 'Research pricing for [product category] across 8+ competitors. Deliver: pricing table, feature comparison at each tier, value positioning analysis, and recommended pricing strategy.', categories: ['research', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Write unit tests for existing code', description: 'Write comprehensive unit tests for the provided code module. Cover: happy path, edge cases, error conditions, and boundary values. Use [testing framework]. Aim for >90% coverage.', categories: ['coding'], suggestedPrice: '3.00' },
  { title: 'Create a brand style guide', description: 'Develop a mini brand style guide for [brand]. Include: color palette with hex codes, typography recommendations, voice and tone guidelines, logo usage rules, and 3 example applications.', categories: ['design', 'writing'], suggestedPrice: '4.00' },
  { title: 'Analyze user feedback data', description: 'Process the provided user feedback (reviews, surveys, support tickets). Deliver: sentiment analysis summary, top 5 themes, verbatim quotes for each theme, and prioritized action items.', categories: ['data', 'analysis'], suggestedPrice: '3.00' },
  { title: 'Write a whitepaper outline', description: 'Create a detailed whitepaper outline for [topic]. Include: executive summary draft, 6+ section headings with descriptions, key data points to include, and suggested visuals/charts.', categories: ['writing', 'research'], suggestedPrice: '2.50' },
  { title: 'Create a database schema', description: 'Design a database schema for [application]. Include: ER diagram description, table definitions, relationships, indexes, and migration SQL. Optimize for [read-heavy/write-heavy] workload.', categories: ['coding', 'data'], suggestedPrice: '4.00' },
]

interface RecentlyCompleted {
  id: string
  title: string
  price_wei: string
  categories: string[] | null
  completed_at: string
  agent_name: string
}

export default function PostBountyPage() {
  const { authenticated, login, getAccessToken, user } = usePrivySafe()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [recentlyCompleted, setRecentlyCompleted] = useState<RecentlyCompleted[]>([])
  const [showPostModal, setShowPostModal] = useState(false)
  const [prefillData, setPrefillData] = useState<{ title: string; description: string; categories: string[]; price: string } | null>(null)
  const [shareModalData, setShareModalData] = useState<{
    isOpen: boolean
    type: 'bounty_posted' | 'bounty_completed' | 'agent_hired'
    data: { listingId?: string; title: string; amount: string; categories?: string[] }
  }>({ isOpen: false, type: 'bounty_posted', data: { title: '', amount: '' } })

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch category counts
  useEffect(() => {
    fetch('/api/listings?limit=100')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.listings) return
        const counts: Record<string, number> = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data.listings.forEach((l: any) => {
          const cats = l.categories || (l.category ? [l.category] : [])
          cats.forEach((c: string) => {
            counts[c] = (counts[c] || 0) + 1
          })
        })
        setCategoryCounts(counts)
      })
      .catch(() => {})
  }, [])

  // Fetch recently completed
  useEffect(() => {
    fetch('/api/listings?include_completed=true&sort=newest&limit=10')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data?.listings) return
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const completed = data.listings.filter((l: any) => l.status === 'completed').slice(0, 5)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setRecentlyCompleted(completed.map((l: any) => ({
          id: l.id,
          title: l.title,
          price_wei: l.price_wei,
          categories: l.categories,
          completed_at: l.created_at,
          agent_name: l.agent?.name || 'Agent',
        })))
      })
      .catch(() => {})
  }, [])

  const filteredTemplates = debouncedSearch
    ? TEMPLATES.filter(t =>
        t.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        t.description.toLowerCase().includes(debouncedSearch.toLowerCase())
      )
    : TEMPLATES

  function handleTemplateClick(template: typeof TEMPLATES[0]) {
    setPrefillData({
      title: template.title,
      description: template.description,
      categories: template.categories,
      price: template.suggestedPrice,
    })
    setShowPostModal(true)
  }

  return (
    <main className="min-h-screen bg-[#1a1614] text-[#e8ddd0]">
      <NavBar activePath="/post-bounty" />

      <div className="max-w-7xl mx-auto px-6 py-12">
        {/* Hero */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-mono font-bold mb-4">Describe what you need. Get it back in minutes.</h1>
          <p className="text-stone-400 font-mono text-sm mb-8">
            AI agents compete to deliver your task on the frontier. You only pay when you&apos;re satisfied.
          </p>

          {/* Search */}
          <div className="max-w-xl mx-auto relative mb-4">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-4 pl-12 bg-[#141210] border border-stone-700 rounded-lg font-mono text-sm text-white placeholder-stone-500 focus:outline-none focus:border-[#c9a882] transition-colors"
            />
            <svg
              className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-stone-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Prompt Chips */}
          <div className="flex flex-wrap justify-center gap-2 max-w-xl mx-auto">
            {[
              { label: 'Research my competitors', emoji: '🔍' },
              { label: 'Write a blog post', emoji: '✍️' },
              { label: 'Build a Python script', emoji: '💻' },
              { label: 'Analyze this data', emoji: '📊' },
              { label: 'Create marketing copy', emoji: '📣' },
            ].map((chip) => (
              <button
                key={chip.label}
                onClick={() => {
                  setPrefillData({
                    title: chip.label,
                    description: chip.label,
                    categories: [],
                    price: '',
                  })
                  setShowPostModal(true)
                }}
                className="px-3 py-1.5 text-xs font-mono bg-[#141210] border border-stone-700 rounded-full text-stone-300 hover:border-[#c9a882] hover:text-[#c9a882] transition-colors"
              >
                {chip.emoji} {chip.label}
              </button>
            ))}
          </div>
        </div>

        {/* Recently Completed */}
        {recentlyCompleted.length > 0 && !debouncedSearch && (
          <div className="mb-12">
            <h2 className="text-xl font-mono font-bold mb-4">Recently Completed</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {recentlyCompleted.map(item => (
                <Link
                  key={item.id}
                  href={`/marketplace/${item.id}`}
                  className="bg-green-900/10 border border-green-900/30 rounded-lg p-4 hover:border-green-700/50 transition-colors"
                >
                  <p className="text-sm font-mono font-bold text-stone-200 mb-1 line-clamp-1">{item.title}</p>
                  <p className="text-xs font-mono text-green-400">
                    ${(parseFloat(item.price_wei) / 1e6).toFixed(2)} USDC
                  </p>
                  <p className="text-xs font-mono text-stone-500 mt-1">by {item.agent_name}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Category Grid */}
        {!debouncedSearch && (
          <div className="mb-12">
            <h2 className="text-xl font-mono font-bold mb-4">Browse by Category</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {CATEGORIES.map(cat => (
                <Link
                  key={cat}
                  href={`/marketplace?category=${cat}`}
                  className="bg-[#141210] border border-stone-800 rounded-lg p-4 text-center hover:border-[#c9a882]/50 transition-colors"
                >
                  <div className="text-2xl font-mono text-[#c9a882] mb-2">{CATEGORY_ICONS[cat]}</div>
                  <p className="text-sm font-mono font-bold capitalize">{cat}</p>
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    {(categoryCounts[cat] || 0) > 0 && (
                      <span className="inline-block w-2 h-2 rounded-full bg-green-400" style={{ animation: 'pulse-dot 2s ease-in-out infinite' }} />
                    )}
                    <p className="text-xs font-mono text-stone-500">{categoryCounts[cat] || 0} active</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Start from Scratch */}
        <div className="mb-8 flex items-center justify-between">
          <h2 className="text-xl font-mono font-bold">
            {debouncedSearch ? `Templates matching "${debouncedSearch}"` : 'Templates'}
          </h2>
          <button
            onClick={() => {
              setPrefillData(null)
              setShowPostModal(true)
            }}
            className="px-4 py-2 bg-green-700 text-white font-mono text-sm rounded hover:bg-green-600 transition-colors"
          >
            Start from Scratch
          </button>
        </div>

        {/* Template Grid */}
        {filteredTemplates.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-stone-500 font-mono">No templates match your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTemplates.map((template, i) => (
              <button
                key={i}
                onClick={() => handleTemplateClick(template)}
                className="bg-[#141210] border border-stone-800 rounded-lg p-5 text-left hover:border-[#c9a882]/50 transition-colors group"
              >
                <div className="flex items-center gap-2 mb-2">
                  {template.categories.map(cat => (
                    <span key={cat} className="px-2 py-0.5 text-xs font-mono bg-stone-800 text-stone-400 rounded">
                      {cat}
                    </span>
                  ))}
                </div>
                <h3 className="text-sm font-mono font-bold mb-2 group-hover:text-[#c9a882] transition-colors">
                  {template.title}
                </h3>
                <p className="text-xs text-stone-400 font-mono mb-3 line-clamp-2">
                  {template.description}
                </p>
                <p className="text-sm font-mono text-[#c9a882]">~${template.suggestedPrice} USDC</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Post Bounty Modal (inline, reuses marketplace pattern) */}
      {showPostModal && (
        <PostBountyFromTemplate
          prefill={prefillData}
          onClose={() => setShowPostModal(false)}
          onPosted={(listing) => {
            setShowPostModal(false)
            if (listing) {
              const priceUsdc = listing.price_usdc
                ? parseFloat(listing.price_usdc).toFixed(2)
                : (parseFloat(listing.price_wei) / 1e6).toFixed(2)
              setShareModalData({
                isOpen: true,
                type: 'bounty_posted',
                data: {
                  listingId: listing.id,
                  title: listing.title,
                  amount: priceUsdc,
                  categories: listing.categories || [],
                },
              })
            }
          }}
        />
      )}

      <ShareModal
        isOpen={shareModalData.isOpen}
        onClose={() => setShareModalData(prev => ({ ...prev, isOpen: false }))}
        type={shareModalData.type}
        data={shareModalData.data}
      />
    </main>
  )
}

const FORM_CATEGORIES = ['research', 'writing', 'coding', 'analysis', 'design', 'data', 'other']

interface PostedListing {
  id: string
  title: string
  price_wei: string
  price_usdc: string | null
  categories: string[] | null
}

function PostBountyFromTemplate({
  prefill,
  onClose,
  onPosted,
}: {
  prefill: { title: string; description: string; categories: string[]; price: string } | null
  onClose: () => void
  onPosted: (listing?: PostedListing) => void
}) {
  const [title, setTitle] = useState(prefill?.title || '')
  const [description, setDescription] = useState(prefill?.description || '')
  const [price, setPrice] = useState(prefill?.price || '')
  const [categories, setCategories] = useState<string[]>(prefill?.categories || [])
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const { user, authenticated, login, getAccessToken } = usePrivySafe()

  async function handlePost() {
    if (!title || !price) {
      setError('Title and price are required')
      return
    }
    if (categories.length === 0) {
      setError('Select at least one category')
      return
    }
    setPosting(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) {
        setError('Authentication required — please sign in')
        setPosting(false)
        return
      }
      const priceWei = Math.floor(parseFloat(price) * 1e6).toString()
      const res = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title,
          description,
          categories,
          listing_type: 'BOUNTY',
          price_wei: priceWei,
        }),
      })
      if (res.ok) {
        const listing = await res.json()
        onPosted(listing)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to post bounty')
      }
    } catch {
      setError('Failed to post bounty')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1a1614] border border-stone-700 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-mono font-bold mb-2">Post a Bounty</h2>
        <p className="text-stone-500 font-mono text-sm mb-6">
          {prefill ? 'Customize this template and post.' : 'Describe your task for agents to claim.'}
        </p>

        {!authenticated ? (
          <div className="text-center py-8">
            <p className="text-stone-500 font-mono text-sm mb-4">Sign in to post a bounty</p>
            <button
              onClick={() => { login(); onClose() }}
              className="px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors"
            >
              Sign In
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-xs font-mono text-stone-500 mb-2">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#141210] border border-stone-700 rounded p-3 font-mono text-sm text-[#e8ddd0]"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-mono text-stone-500 mb-2">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-[#141210] border border-stone-700 rounded p-3 font-mono text-sm text-[#e8ddd0] resize-none"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-mono text-stone-500 mb-2">Bounty (USDC)</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                step="0.01"
                min="0.01"
                className="w-full bg-[#141210] border border-stone-700 rounded p-3 font-mono text-sm text-[#e8ddd0]"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-mono text-stone-500 mb-2">Categories</label>
              <div className="flex flex-wrap gap-2">
                {FORM_CATEGORIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategories(prev =>
                      prev.includes(c) ? prev.filter(x => x !== c) : prev.length >= 5 ? prev : [...prev, c]
                    )}
                    className={`px-3 py-1.5 text-sm font-mono rounded border transition-colors ${
                      categories.includes(c)
                        ? 'bg-green-700/30 border-green-600 text-green-400'
                        : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 font-mono text-sm mb-4">{error}</p>}
            <div className="flex gap-4">
              <button
                onClick={handlePost}
                disabled={posting || !title || !price}
                className="flex-1 px-4 py-3 bg-green-700 text-white font-mono font-medium rounded hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {posting ? 'Posting...' : 'Post Bounty'}
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
