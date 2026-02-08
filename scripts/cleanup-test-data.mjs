import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function cleanupTestData() {
  console.log('🔍 Comprehensive test data scan...\n')

  // Find listings with absurd prices
  const { data: expensiveListings } = await supabase
    .from('listings')
    .select('*')
    .gt('price_wei', '10000000000')

  console.log('💰 Listings with prices > $10,000:')
  console.log(expensiveListings && expensiveListings.length > 0 ? 
    expensiveListings.map(l => `  ${l.title} - $${(parseFloat(l.price_wei)/1e6).toFixed(2)}`).join('\n') : 
    '  None found ✅')

  // Find very cheap listings
  const { data: cheapListings } = await supabase
    .from('listings')
    .select('*')
    .lt('price_wei', '1000')
    .gt('price_wei', '0')

  console.log('\n💸 Listings with prices < $0.001:')
  console.log(cheapListings && cheapListings.length > 0 ?
    cheapListings.map(l => `  ${l.title} - $${(parseFloat(l.price_wei)/1e6).toFixed(6)}`).join('\n') :
    '  None found ✅')

  // Find test agents
  const { data: testAgents } = await supabase
    .from('agents')
    .select('id, name, is_active')
    .or('name.ilike.%test%,name.ilike.%debug%,name.ilike.%fake%,name.ilike.%demo%')

  console.log('\n🤖 Suspicious test agents:')
  console.log(testAgents && testAgents.length > 0 ?
    testAgents.map(a => `  ${a.name} (${a.is_active ? 'active' : 'inactive'})`).join('\n') :
    '  None found ✅')

  // Delete absurdly priced listings
  if (expensiveListings && expensiveListings.length > 0) {
    console.log('\n🗑️  Deleting expensive listings...')
    for (const listing of expensiveListings) {
      const { error } = await supabase.from('listings').delete().eq('id', listing.id)
      console.log(error ? `  ❌ ${listing.title}` : `  ✅ Deleted ${listing.title}`)
    }
  }

  console.log('\n📊 Summary:')
  console.log(`  - Expensive listings: ${expensiveListings?.length || 0}`)
  console.log(`  - Very cheap listings: ${cheapListings?.length || 0} (flagged, not deleted)`)
  console.log(`  - Test agents: ${testAgents?.length || 0} (flagged, not deleted)`)
  console.log('\n✨ Cleanup complete!')
}

cleanupTestData().catch(console.error)
