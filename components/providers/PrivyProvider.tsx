'use client'

import { PrivyProvider as Privy } from '@privy-io/react-auth'
import { base, baseSepolia } from 'viem/chains'

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  // If no Privy app ID configured, render children without Privy wrapper
  // This allows the app to work in read-only mode without auth
  if (!appId) {
    console.warn('NEXT_PUBLIC_PRIVY_APP_ID not configured - auth disabled')
    return <>{children}</>
  }

  return (
    <Privy
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#c9a882',
          logo: '/logo.png',
        },
        loginMethods: ['wallet', 'email', 'google', 'twitter', 'farcaster'],
        defaultChain: base,
        supportedChains: [base, baseSepolia],
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </Privy>
  )
}
