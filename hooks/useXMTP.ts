/**
 * XMTP React Hook
 *
 * Provides XMTP messaging functionality in React components.
 * Uses Privy wallet for signing.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import type { Client, Conversation, DecodedMessage } from '@xmtp/xmtp-js'

// Environment config
const XMTP_ENV = process.env.NEXT_PUBLIC_CHAIN === 'sepolia' ? 'dev' : 'production'

export interface UseXMTPReturn {
  client: Client | null
  isLoading: boolean
  error: string | null
  isInitialized: boolean
  conversations: Conversation[]
  initialize: () => Promise<void>
  getConversation: (peerAddress: string) => Promise<Conversation | null>
  sendMessage: (conversation: Conversation, content: string) => Promise<DecodedMessage | null>
  getMessages: (conversation: Conversation, limit?: number) => Promise<DecodedMessage[]>
  canMessage: (peerAddress: string) => Promise<boolean>
}

export function useXMTP(): UseXMTPReturn {
  const { ready, authenticated } = usePrivy()
  const { wallets } = useWallets()
  const [client, setClient] = useState<Client | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const initializingRef = useRef(false)

  const initialize = useCallback(async () => {
    console.log('[XMTP] Initialize called', { ready, authenticated, wallets: wallets.length, hasClient: !!client })

    if (!ready || !authenticated) {
      console.log('[XMTP] Not ready or not authenticated')
      setError('Please connect your wallet first')
      return
    }

    if (initializingRef.current) {
      console.log('[XMTP] Already initializing')
      return
    }

    if (client) {
      console.log('[XMTP] Already have client')
      return
    }

    // Try to find any available wallet - prefer Privy embedded, but accept external
    console.log('[XMTP] Available wallets:', wallets.map(w => ({ type: w.walletClientType, address: w.address })))

    const wallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0]
    if (!wallet) {
      console.log('[XMTP] No wallet found')
      setError('No wallet available. Please connect a wallet.')
      return
    }

    console.log('[XMTP] Using wallet:', wallet.walletClientType, wallet.address)

    initializingRef.current = true
    setIsLoading(true)
    setError(null)

    try {
      // Dynamic import to avoid SSR issues
      const { Client } = await import('@xmtp/xmtp-js')
      console.log('[XMTP] Client imported')

      // Get ethereum provider from wallet
      const provider = await wallet.getEthereumProvider()
      console.log('[XMTP] Got provider')

      // Create a signer compatible with XMTP
      const signer = {
        getAddress: async () => wallet.address,
        signMessage: async (message: string) => {
          console.log('[XMTP] Requesting signature...')
          // Use the provider to sign
          const signature = await provider.request({
            method: 'personal_sign',
            params: [message, wallet.address],
          })
          console.log('[XMTP] Got signature')
          return signature as string
        },
      }

      // Create XMTP client - this will prompt for signature
      console.log('[XMTP] Creating XMTP client...')
      const xmtpClient = await Client.create(signer, { env: XMTP_ENV })
      console.log('[XMTP] Client created')
      setClient(xmtpClient)

      // Load existing conversations
      const convos = await xmtpClient.conversations.list()
      console.log('[XMTP] Loaded', convos.length, 'conversations')
      setConversations(convos)

      setIsInitialized(true)
    } catch (err) {
      console.error('[XMTP] Initialization error:', err)
      setError(err instanceof Error ? err.message : 'Failed to initialize XMTP')
    } finally {
      setIsLoading(false)
      initializingRef.current = false
    }
  }, [ready, authenticated, wallets, client])

  const getConversation = useCallback(async (peerAddress: string): Promise<Conversation | null> => {
    if (!client) {
      setError('XMTP not initialized')
      return null
    }

    try {
      // Check if we can message this address
      const canMsg = await client.canMessage(peerAddress)
      if (!canMsg) {
        setError('This address cannot receive XMTP messages')
        return null
      }

      // Find existing or create new
      const existing = conversations.find(
        c => c.peerAddress.toLowerCase() === peerAddress.toLowerCase()
      )
      if (existing) return existing

      const newConvo = await client.conversations.newConversation(peerAddress)
      setConversations(prev => [...prev, newConvo])
      return newConvo
    } catch (err) {
      console.error('Get conversation error:', err)
      setError(err instanceof Error ? err.message : 'Failed to get conversation')
      return null
    }
  }, [client, conversations])

  const sendMessage = useCallback(async (
    conversation: Conversation,
    content: string
  ): Promise<DecodedMessage | null> => {
    if (!client) {
      setError('XMTP not initialized')
      return null
    }

    try {
      return await conversation.send(content)
    } catch (err) {
      console.error('Send message error:', err)
      setError(err instanceof Error ? err.message : 'Failed to send message')
      return null
    }
  }, [client])

  const getMessages = useCallback(async (
    conversation: Conversation,
    limit: number = 50
  ): Promise<DecodedMessage[]> => {
    try {
      return await conversation.messages({ limit })
    } catch (err) {
      console.error('Get messages error:', err)
      return []
    }
  }, [])

  const canMessage = useCallback(async (peerAddress: string): Promise<boolean> => {
    if (!client) return false
    try {
      return await client.canMessage(peerAddress)
    } catch {
      return false
    }
  }, [client])

  // Removed auto-initialize - users must explicitly click "Connect to XMTP"
  // This avoids unexpected signature prompts and makes the flow clearer

  return {
    client,
    isLoading,
    error,
    isInitialized,
    conversations,
    initialize,
    getConversation,
    sendMessage,
    getMessages,
    canMessage,
  }
}
