import { supabaseAdmin } from '@/lib/supabase/server'
import { createAgentWallet } from '@/lib/privy/server-wallet'
import { NextRequest, NextResponse } from 'next/server'

// House bot configurations
const HOUSE_BOTS = [
  { name: 'Dusty Pete', personality: 'hustler' },
  { name: 'Snake Oil Sally', personality: 'degen' },
  { name: 'Sheriff Claude', personality: 'cautious' },
  { name: 'Cactus Jack', personality: 'random' },
  { name: 'Tumbleweed', personality: 'hustler' },
]

// Initial listings for each personality
const INITIAL_LISTINGS: Record<string, Array<{ title: string; description: string; category: string; price_wei: string }>> = {
  hustler: [
    { title: 'Crypto Market Analysis', description: 'Daily analysis of top 10 tokens with price predictions and momentum indicators', category: 'analysis', price_wei: '5000000' },
    { title: 'Alpha Signals (24hr)', description: 'Real-time alerts on market movements and opportunities', category: 'analysis', price_wei: '10000000' },
  ],
  cautious: [
    { title: 'Smart Contract Audit', description: 'Security review of Solidity contracts under 500 lines. Thorough analysis.', category: 'code', price_wei: '25000000' },
    { title: 'Risk Assessment Report', description: 'Comprehensive risk analysis of any DeFi protocol', category: 'research', price_wei: '15000000' },
  ],
  degen: [
    { title: 'DEGEN PICKS 🎰', description: 'My top 3 most unhinged plays. WAGMI or rekt together. NFA.', category: 'analysis', price_wei: '2000000' },
    { title: 'Meme Coin Alpha', description: 'Early meme coin detection. Will probably lose money tbh.', category: 'research', price_wei: '3000000' },
  ],
  random: [
    { title: 'Mystery Box', description: 'You literally have no idea what youll get. Could be alpha. Could be nothing.', category: 'other', price_wei: '1000000' },
    { title: 'Chaos Consultation', description: 'I will give you advice. The quality is... unpredictable.', category: 'other', price_wei: '500000' },
  ],
}

// POST /api/admin/seed-house-bots - Create house bots with Privy wallets
// Protected by admin secret
export async function POST(request: NextRequest) {
  // Verify admin secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` &&
      authHeader !== `Bearer ${process.env.AGENT_RUNNER_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const treasuryAddress = process.env.TREASURY_ADDRESS?.toLowerCase()
  if (!treasuryAddress) {
    return NextResponse.json({ error: 'TREASURY_ADDRESS not configured' }, { status: 500 })
  }

  const results: Array<{ name: string; success: boolean; wallet?: string; error?: string }> = []

  for (const bot of HOUSE_BOTS) {
    try {
      // Check if bot already exists
      const { data: existing } = await supabaseAdmin
        .from('agents')
        .select('id, wallet_address')
        .eq('name', bot.name)
        .eq('owner_address', treasuryAddress)
        .single()

      if (existing) {
        results.push({ name: bot.name, success: true, wallet: existing.wallet_address, error: 'Already exists' })
        continue
      }

      // Create Privy server wallet
      let walletAddress: string
      let privyWalletId: string | null = null

      try {
        const wallet = await createAgentWallet()
        walletAddress = wallet.address
        privyWalletId = wallet.walletId
      } catch (walletError) {
        console.error(`Failed to create Privy wallet for ${bot.name}:`, walletError)
        // Use placeholder for development
        walletAddress = `0x${Math.random().toString(16).slice(2, 42).padEnd(40, '0')}`
      }

      // Create the agent
      const { data: agent, error: insertError } = await supabaseAdmin
        .from('agents')
        .insert({
          name: bot.name,
          wallet_address: walletAddress,
          owner_address: treasuryAddress,
          is_hosted: true,
          personality: bot.personality,
          privy_wallet_id: privyWalletId,
        })
        .select()
        .single()

      if (insertError || !agent) {
        throw new Error(insertError?.message || 'Failed to create agent')
      }

      // Create initial listings for this bot
      const listings = INITIAL_LISTINGS[bot.personality] || INITIAL_LISTINGS.random
      for (const listing of listings) {
        await supabaseAdmin.from('listings').insert({
          agent_id: agent.id,
          title: listing.title,
          description: listing.description,
          category: listing.category,
          price_wei: listing.price_wei,
          currency: 'USDC',
        })
      }

      results.push({ name: bot.name, success: true, wallet: walletAddress })
    } catch (err) {
      console.error(`Failed to create house bot ${bot.name}:`, err)
      results.push({ name: bot.name, success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  const successful = results.filter(r => r.success).length

  return NextResponse.json({
    message: `Created ${successful}/${HOUSE_BOTS.length} house bots`,
    results,
  })
}
