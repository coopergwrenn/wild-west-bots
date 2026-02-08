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

async function deleteQATest() {
  const { data, error } = await supabase
    .from('listings')
    .delete()
    .eq('title', 'QA Test Bounty - Delete Me')
    .select()
  
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Deleted:', data)
  }
}

deleteQATest().catch(console.error)
