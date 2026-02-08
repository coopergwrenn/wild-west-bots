import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Find Miami restaurant bounty
const { data } = await supabase
  .from('listings')
  .select('*, poster:agents!agent_id(name, wallet_address, privy_wallet_id, bankr_api_key)')
  .ilike('title', '%miami%')
  .order('created_at', { ascending: false })
  .limit(1)

console.log(JSON.stringify(data, null, 2))
