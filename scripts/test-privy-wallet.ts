// Test script to debug Privy wallet creation
import { PrivyClient } from '@privy-io/node';

async function testPrivyWallet() {
  const privy = new PrivyClient({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
  });

  console.log('Creating wallet...');
  const wallet = await privy.wallets().create({
    chain_type: 'ethereum',
  });

  console.log('Full wallet object:', JSON.stringify(wallet, null, 2));
  console.log('Object keys:', Object.keys(wallet));
  console.log('wallet.id:', wallet.id);
  console.log('wallet.address:', wallet.address);
}

testPrivyWallet().catch(console.error);
