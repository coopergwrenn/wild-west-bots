#!/usr/bin/env node
/**
 * Manually assign VM to user (workaround for webhook issues)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

const email = process.argv[2] || 'coopergrantwrenn@gmail.com';

async function manualAssign() {
  console.log('🔧 Manually assigning VM to:', email);
  console.log('');

  // Find user
  const { data: user } = await supabase
    .from('instaclaw_users')
    .select('id')
    .eq('email', email)
    .single();

  if (!user) {
    console.log('❌ User not found');
    return;
  }

  console.log('✅ User ID:', user.id);

  // Assign VM using the database function
  const { data: vm, error } = await supabase.rpc('instaclaw_assign_vm', {
    p_user_id: user.id
  });

  if (error) {
    console.error('❌ Assignment error:', error.message);
    return;
  }

  if (!vm) {
    console.log('❌ No VMs available in pool');
    return;
  }

  console.log('✅ VM assigned:', vm.ip_address);
  console.log('');

  // Trigger configure endpoint
  console.log('🔧 Triggering configuration...');
  try {
    const configRes = await fetch('https://instaclaw.io/api/vm/configure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || 'dev-secret'
      },
      body: JSON.stringify({ userId: user.id })
    });

    if (configRes.ok) {
      console.log('✅ Configuration triggered successfully');
    } else {
      console.log('⚠️  Configure endpoint returned:', configRes.status);
    }
  } catch (err) {
    console.log('⚠️  Configure trigger failed:', err.message);
    console.log('   (VM is assigned, configure will run via polling)');
  }

  console.log('');
  console.log('✅ Done! Refresh the deploying page to see progress.');
}

manualAssign().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
