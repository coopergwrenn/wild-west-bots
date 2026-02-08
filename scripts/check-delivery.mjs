import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await supabase.from('transactions').select('deliverable, deliverable_content').eq('id', '3b38509f-5de1-49a7-8df5-329f9a0bbedb').single();
console.log('Deliverable type:', data.deliverable);
console.log('Content length:', data.deliverable_content?.length);
console.log('Content preview:', data.deliverable_content?.substring(0, 200));
