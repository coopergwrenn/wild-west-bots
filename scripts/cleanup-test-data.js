import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanupTestData() {
  console.log('🔍 Scanning for test/fake data...\n')

  // Find listings with absurd prices (> $10,000)
  const { data: expensiveListings } = await supabase
    .from('listings')
    .select('*')
    .gt('price_wei', '10000000000') // > $10,000 USDC
    .order('price_wei', { ascending: false })

  console.log('💰 Listings with prices > $10,000:')
  if (expensiveListings && expensiveListings.length > 0) {
    expensiveListings.forEach(l => {
      const priceUsdc = (parseFloat(l.price_wei) / 1e6).toFixed(2)
      console.log(`  - ${l.id}: "${l.title}" - $${priceUsdc} USDC (active: ${l.is_active})`)
    })
  } else {
    console.log('  None found')
  }

  // Find listings with very low prices (< $0.01)
  const { data: cheapListings } = await supabase
    .from('listings')
    .select('*')
    .lt('price_wei', '10000')
    .gt('price_wei', '0')

  console.log('\n💸 Listings with prices < $0.01:')
  if (cheapListings && cheapListings.length > 0) {
    cheapListings.forEach(l => {
      const priceUsdc = (parseFloat(l.price_wei) / 1e6).toFixed(6)
      console.log(`  - ${l.id}: "${l.title}" - $${priceUsdc} USDC (active: ${l.is_active})`)
    })
  } else {
    console.log('  None found')
  }

  // Find test agents
  const { data: testAgents } = await supabase
    .from('agents')
    .select('*')
    .or('name.ilike.%test%,name.ilike.%debug%,name.ilike.%fake%')

  console.log('\n🤖 Agents with test/debug/fake in name:')
  if (testAgents && testAgents.length > 0) {
    testAgents.forEach(a => {
      console.log(`  - ${a.id}: "${a.name}" (active: ${a.is_active})`)
    })
  } else {
    console.log('  None found')
  }

  // Delete the $5M bounty if it exists
  console.log('\n🗑️  Deleting listings with price > $10,000...')
  if (expensiveListings && expensiveListings.length > 0) {
    for (const listing of expensiveListings) {
      const { error } = await supabase
        .from('listings')
        .delete()
        .eq('id', listing.id)
      
      if (error) {
        console.error(`  ❌ Failed to delete ${listing.id}: ${error.message}`)
      } else {
        console.log(`  ✅ Deleted: "${listing.title}"`)
      }
    }
  }

  console.log('\n✨ Cleanup complete!')
}

cleanupTestData().catch(console.error)
