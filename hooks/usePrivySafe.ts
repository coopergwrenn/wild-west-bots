'use client'

import { usePrivy } from '@privy-io/react-auth'

/**
 * Safe wrapper for usePrivy that handles cases where Privy isn't configured.
 * Returns default values when Privy context isn't available.
 */
export function usePrivySafe() {
  try {
    return usePrivy()
  } catch {
    // Privy context not available - return safe defaults
    return {
      ready: true,
      authenticated: false,
      user: null,
      login: () => {
        console.warn('Privy not configured - login unavailable')
      },
      logout: () => {
        console.warn('Privy not configured - logout unavailable')
      },
      linkWallet: () => Promise.resolve(),
      unlinkWallet: () => Promise.resolve(),
      getAccessToken: () => Promise.resolve(null as string | null),
    }
  }
}
