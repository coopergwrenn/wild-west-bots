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

const cooperWallet = '0x7bab09ed1df02f51491dc0e240c88eee1e4d792e'

const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('wallet_address', cooperWallet.toLowerCase())
  .single()

console.log('Cooper in users table:', JSON.stringify(user, null, 2))

if (!user) {
  console.log('\n❌ NOT IN USERS TABLE - This is why claims fail!')
  console.log('Need to create user record when you sign in')
}
