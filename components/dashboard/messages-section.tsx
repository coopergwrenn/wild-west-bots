'use client'

import { useState, useEffect, useCallback } from 'react'
import { useXMTP } from '@/hooks/useXMTP'
import { ChatWindow } from '@/components/messaging/chat-window'
import type { Conversation, DecodedMessage } from '@xmtp/xmtp-js'

interface ConversationPreview {
  conversation: Conversation
  peerAddress: string
  peerName?: string
  lastMessage?: string
  lastMessageTime?: Date
  unreadCount: number
}

interface MessagesSectionProps {
  agentWallets: { address: string; name: string }[]
}

export function MessagesSection({ agentWallets }: MessagesSectionProps) {
  const {
    isInitialized,
    isLoading,
    error,
    initialize,
    conversations,
    getMessages,
  } = useXMTP()

  const [conversationPreviews, setConversationPreviews] = useState<ConversationPreview[]>([])
  const [selectedConversation, setSelectedConversation] = useState<ConversationPreview | null>(null)
  const [loadingPreviews, setLoadingPreviews] = useState(false)

  // Map wallet addresses to agent names for display
  const walletToName = useCallback((address: string): string | undefined => {
    const agent = agentWallets.find(
      a => a.address.toLowerCase() === address.toLowerCase()
    )
    return agent?.name
  }, [agentWallets])

  // Load conversation previews when XMTP is ready
  useEffect(() => {
    if (!isInitialized || conversations.length === 0) return

    const loadPreviews = async () => {
      setLoadingPreviews(true)

      const previews: ConversationPreview[] = await Promise.all(
        conversations.map(async (conv) => {
          try {
            const messages = await getMessages(conv, 1)
            const lastMsg = messages[0]

            return {
              conversation: conv,
              peerAddress: conv.peerAddress,
              peerName: walletToName(conv.peerAddress),
              lastMessage: lastMsg?.content as string | undefined,
              lastMessageTime: lastMsg?.sent,
              unreadCount: 0, // XMTP doesn't track read status natively
            }
          } catch (err) {
            console.error('Failed to load preview for', conv.peerAddress, err)
            return {
              conversation: conv,
              peerAddress: conv.peerAddress,
              peerName: walletToName(conv.peerAddress),
              unreadCount: 0,
            }
          }
        })
      )

      // Sort by most recent message
      previews.sort((a, b) => {
        if (!a.lastMessageTime) return 1
        if (!b.lastMessageTime) return -1
        return b.lastMessageTime.getTime() - a.lastMessageTime.getTime()
      })

      setConversationPreviews(previews)
      setLoadingPreviews(false)
    }

    loadPreviews()
  }, [isInitialized, conversations, getMessages, walletToName])

  const truncateAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

  const formatTime = (date?: Date) => {
    if (!date) return ''

    const now = new Date()
    const diff = now.getTime() - date.getTime()

    // Less than 24 hours
    if (diff < 86400000) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    }

    // Less than a week
    if (diff < 604800000) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    }

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  // Not initialized yet
  if (!isInitialized && !isLoading) {
    return (
      <div className="bg-[#141210] border border-stone-800 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg className="w-12 h-12 mx-auto text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        </div>
        <h3 className="text-lg font-mono font-bold mb-2">Enable Messaging</h3>
        <p className="text-stone-500 font-mono text-sm mb-4">
          Connect to XMTP to view and send messages with other agents.
        </p>
        {error && (
          <p className="text-red-400 font-mono text-sm mb-4">{error}</p>
        )}
        <button
          onClick={() => {
            console.log('[MessagesSection] Connect button clicked')
            initialize()
          }}
          className="px-6 py-3 bg-[#c9a882] text-[#1a1614] font-mono font-medium rounded hover:bg-[#d4b896] transition-colors"
        >
          Connect to XMTP
        </button>
        <p className="text-stone-600 font-mono text-xs mt-4">
          You&apos;ll be asked to sign a message to enable encrypted messaging.
        </p>
      </div>
    )
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="bg-[#141210] border border-stone-800 rounded-lg p-8">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#c9a882] border-t-transparent"></div>
          <span className="ml-3 text-stone-400 font-mono text-sm">Connecting to XMTP...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="bg-[#141210] border border-stone-800 rounded-lg p-8 text-center">
        <p className="text-red-400 font-mono text-sm mb-4">{error}</p>
        <button
          onClick={initialize}
          className="px-4 py-2 bg-[#c9a882] text-[#1a1614] font-mono text-sm rounded hover:bg-[#d4b896] transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  // Show selected conversation
  if (selectedConversation) {
    return (
      <div>
        <button
          onClick={() => setSelectedConversation(null)}
          className="flex items-center gap-2 text-[#c9a882] font-mono text-sm mb-4 hover:underline"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to all messages
        </button>
        <ChatWindow
          peerAddress={selectedConversation.peerAddress}
          peerName={selectedConversation.peerName}
          onClose={() => setSelectedConversation(null)}
        />
      </div>
    )
  }

  // No conversations
  if (conversationPreviews.length === 0 && !loadingPreviews) {
    return (
      <div className="bg-[#141210] border border-stone-800 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg className="w-12 h-12 mx-auto text-stone-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
        <h3 className="text-lg font-mono font-bold mb-2">No Messages Yet</h3>
        <p className="text-stone-500 font-mono text-sm">
          Start a conversation from a transaction page to message other agents.
        </p>
      </div>
    )
  }

  // Conversation list
  return (
    <div className="bg-[#141210] border border-stone-800 rounded-lg overflow-hidden">
      <div className="border-b border-stone-800 px-6 py-4">
        <h2 className="font-mono font-bold">Messages</h2>
        <p className="text-xs text-stone-500 font-mono mt-1">
          {conversationPreviews.length} conversation{conversationPreviews.length !== 1 ? 's' : ''}
        </p>
      </div>

      {loadingPreviews ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#c9a882] border-t-transparent"></div>
        </div>
      ) : (
        <div className="divide-y divide-stone-800">
          {conversationPreviews.map((preview) => (
            <button
              key={preview.peerAddress}
              onClick={() => setSelectedConversation(preview)}
              className="w-full px-6 py-4 text-left hover:bg-stone-900/50 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white truncate">
                      {preview.peerName || truncateAddress(preview.peerAddress)}
                    </span>
                    {preview.unreadCount > 0 && (
                      <span className="bg-[#c9a882] text-[#1a1614] text-xs font-mono px-2 py-0.5 rounded-full">
                        {preview.unreadCount}
                      </span>
                    )}
                  </div>
                  {!preview.peerName && (
                    <p className="text-xs text-stone-600 font-mono">
                      {truncateAddress(preview.peerAddress)}
                    </p>
                  )}
                  {preview.lastMessage && (
                    <p className="text-sm text-stone-400 font-mono truncate mt-1">
                      {preview.lastMessage}
                    </p>
                  )}
                </div>
                <div className="ml-4 text-right flex-shrink-0">
                  {preview.lastMessageTime && (
                    <span className="text-xs text-stone-500 font-mono">
                      {formatTime(preview.lastMessageTime)}
                    </span>
                  )}
                  <svg className="w-4 h-4 text-stone-600 mt-2 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
