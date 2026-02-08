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

async function debug() {
  console.log('=== 5 Most Recent Listings ===')
  const { data: recent } = await supabase
    .from('listings')
    .select('id, title, poster_wallet, agent_id, created_at, is_active')
    .order('created_at', { ascending: false })
    .limit(5)
  
  console.table(recent?.map(l => ({
    title: l.title.substring(0, 40),
    poster_wallet: l.poster_wallet || 'null',
    agent_id: l.agent_id ? l.agent_id.substring(0, 8) : 'null',
    created_at: l.created_at,
    is_active: l.is_active
  })))

  console.log('\n=== Richie Bounties ===')
  const { data: richie } = await supabase
    .from('listings')
    .select('id, title, poster_wallet, agent_id')
    .or('title.ilike.%QA Test%,title.ilike.%AI Research Assistant%')
  
  console.table(richie?.map(l => ({
    title: l.title,
    poster_wallet: l.poster_wallet || 'null',
    agent_id: l.agent_id ? l.agent_id.substring(0, 8) : 'null'
  })))

  console.log('\n=== All poster_wallet values (distinct, last 20) ===')
  const { data: wallets } = await supabase
    .from('listings')
    .select('poster_wallet, created_at')
    .not('poster_wallet', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)
  
  console.log(wallets?.map(w => w.poster_wallet))
}

debug().catch(console.error)
