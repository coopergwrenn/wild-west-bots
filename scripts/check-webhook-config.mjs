#!/usr/bin/env node
/**
 * Check Stripe webhook configuration
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const EXPECTED_WEBHOOK_URL = 'https://instaclaw.io/api/billing/webhook';

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not set in environment');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

async function checkWebhooks() {
  console.log('🔍 Checking Stripe webhook endpoints...\n');

  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });

    console.log(`Found ${endpoints.data.length} webhook endpoint(s):\n`);

    for (const endpoint of endpoints.data) {
      const isMatch = endpoint.url === EXPECTED_WEBHOOK_URL;
      console.log(`${isMatch ? '✅' : '⚠️ '} ${endpoint.url}`);
      console.log(`   ID: ${endpoint.id}`);
      console.log(`   Status: ${endpoint.status}`);
      console.log(`   Secret: ${endpoint.secret.substring(0, 20)}...`);
      console.log(`   Events: ${endpoint.enabled_events.join(', ')}`);

      if (isMatch) {
        console.log(`\n   🔑 Copy this signing secret to your production environment:`);
        console.log(`   STRIPE_WEBHOOK_SECRET="${endpoint.secret}"\n`);
      }
      console.log('');
    }

    const matchingEndpoint = endpoints.data.find(e => e.url === EXPECTED_WEBHOOK_URL);

    if (!matchingEndpoint) {
      console.log('❌ No webhook endpoint found for:', EXPECTED_WEBHOOK_URL);
      console.log('\n💡 Create one at: https://dashboard.stripe.com/webhooks\n');
    } else if (matchingEndpoint.status !== 'enabled') {
      console.log('⚠️  Webhook endpoint is not enabled!');
    }

  } catch (err) {
    console.error('❌ Error checking webhooks:', err.message);
    process.exit(1);
  }
}

checkWebhooks();
