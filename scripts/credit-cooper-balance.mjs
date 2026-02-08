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
const creditAmount = '10000000' // $10 USDC (in wei/6 decimals)

// Credit Cooper's platform balance
const { error: creditError } = await supabase.rpc('increment_user_balance', {
  p_wallet_address: cooperWallet.toLowerCase(),
  p_amount_wei: creditAmount
})

if (creditError) {
  console.error('Failed to credit balance:', creditError)
  process.exit(1)
}

// Record as internal credit (not a real deposit, just for testing)
await supabase.from('platform_transactions').insert({
  user_wallet: cooperWallet.toLowerCase(),
  type: 'DEPOSIT',
  amount_wei: creditAmount,
  description: 'Test credit for platform balance testing'
})

console.log(`✅ Credited ${(Number(creditAmount) / 1e6).toFixed(2)} USDC to Cooper's platform balance`)

// Check final balance
const { data: user } = await supabase
  .from('users')
  .select('platform_balance_wei, locked_balance_wei')
  .eq('wallet_address', cooperWallet.toLowerCase())
  .single()

console.log('\nCooper\'s balance:')
console.log(`  Available: ${(Number(user.platform_balance_wei) / 1e6).toFixed(2)} USDC`)
console.log(`  Locked: ${(Number(user.locked_balance_wei) / 1e6).toFixed(2)} USDC`)
console.log(`  Total: ${((Number(user.platform_balance_wei) + Number(user.locked_balance_wei)) / 1e6).toFixed(2)} USDC`)
