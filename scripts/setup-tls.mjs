#!/usr/bin/env node
/**
 * TLS Setup Checker for InstaClaw
 * Verifies GoDaddy DNS API credentials are configured
 */

console.log('\n🔒 InstaClaw TLS Setup Check\n');

const apiKey = process.env.GODADDY_API_KEY;
const apiSecret = process.env.GODADDY_API_SECRET;

if (apiKey && apiSecret) {
  console.log('✅ GoDaddy DNS API credentials configured!\n');
  console.log(`   GODADDY_API_KEY: ${apiKey.substring(0, 12)}...`);
  console.log(`   GODADDY_API_SECRET: ${apiSecret.substring(0, 12)}...\n`);

  console.log('✅ TLS implementation ready:');
  console.log('   • lib/godaddy.ts - DNS A record creation');
  console.log('   • lib/ssh.ts:setupTLS - Caddy + Let\'s Encrypt');
  console.log('   • Auto HTTPS for every new VM\n');

  console.log('Next VM deployed will get https://vm-XX.vm.instaclaw.io\n');
  process.exit(0);
}

console.log('❌ GoDaddy DNS API credentials missing\n');
console.log('⚠️  SECURITY RISK: VMs serving HTTP expose:');
console.log('   • Bot tokens in plain text');
console.log('   • API keys unencrypted');
console.log('   • User credentials vulnerable\n');

console.log('📋 HOW TO FIX:\n');
console.log('1. Go to https://developer.godaddy.com/');
console.log('2. Sign in with your GoDaddy account');
console.log('3. Click "API Keys" → Create New API Key');
console.log('4. Environment: Production');
console.log('5. Copy the Key and Secret (shown only once!)\n');

console.log('6. Add to Vercel production:');
console.log('   vercel env add GODADDY_API_KEY production');
console.log('   vercel env add GODADDY_API_SECRET production\n');

console.log('7. Add to local .env.local:');
console.log('   GODADDY_API_KEY="your_key_here"');
console.log('   GODADDY_API_SECRET="your_secret_here"\n');

console.log('8. Deploy: git push\n');

console.log('Each VM will automatically get:');
console.log('   • DNS A record: vm-XX.vm.instaclaw.io → VM IP');
console.log('   • Caddy reverse proxy on VM');
console.log('   • Let\'s Encrypt TLS certificate');
console.log('   • HTTPS gateway URL\n');
