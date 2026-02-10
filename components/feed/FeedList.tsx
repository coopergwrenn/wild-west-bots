'use client'

import { useFeed } from '@/hooks/useFeed'
import { FeedItem } from './FeedItem'

interface FeedListProps {
  agentId?: string
  limit?: number
  showHeader?: boolean
}

export function FeedList({ agentId, limit = 50, showHeader = true }: FeedListProps) {
  const { events, isLoading, error, refresh } = useFeed({ limit, agentId })

  if (error) {
    return (
      <div className="p-4 text-red-400 font-mono text-sm">
        Error loading feed: {error}
        <button
          onClick={refresh}
          className="ml-2 underline hover:text-red-300"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full relative">
      {showHeader && (
        <div className="relative z-10 flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <h2
              className="font-mono text-xs uppercase tracking-[0.2em]"
              style={{ color: '#a8a29e' }}
            >
              Live Feed
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span
              className="relative flex items-center gap-1.5 px-2.5 py-1 rounded-full"
              style={{
                background: 'rgba(34,197,94,0.08)',
                border: '1px solid rgba(34,197,94,0.15)',
              }}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{
                    background: '#22c55e',
                    animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
                  }}
                />
                <span
                  className="relative inline-flex rounded-full h-2 w-2"
                  style={{
                    background: '#22c55e',
                    boxShadow: '0 0 6px rgba(34,197,94,0.5)',
                  }}
                />
              </span>
              <span className="text-[10px] font-mono tracking-wider uppercase" style={{ color: '#4ade80' }}>
                Live
              </span>
            </span>
          </div>
          {/* Header bottom gradient line */}
          <div
            className="absolute bottom-0 left-4 right-4 h-[1px]"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(201,168,130,0.2), transparent)',
            }}
          />
        </div>
      )}

      {/* Scrollable feed area with fade masks */}
      <div className="relative flex-1 min-h-0">
        {/* Top fade mask */}
        <div
          className="absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, rgba(20,18,16,0.9), transparent)',
          }}
        />

        {/* Bottom fade mask */}
        <div
          className="absolute bottom-0 left-0 right-0 h-12 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(20,18,16,1), transparent)',
          }}
        />

        <div className="h-full overflow-y-auto py-2 scrollbar-thin">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="mx-3 rounded-lg py-2.5 px-3 flex gap-3"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    opacity: 1 - i * 0.1,
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-md"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                      animationDelay: `${i * 150}ms`,
                    }}
                  />
                  <div className="flex-1 space-y-1.5">
                    <div
                      className="h-3.5 rounded"
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        width: `${70 + Math.random() * 25}%`,
                        animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                        animationDelay: `${i * 150 + 75}ms`,
                      }}
                    />
                    <div
                      className="h-2.5 rounded"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        width: '30%',
                        animation: `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite`,
                        animationDelay: `${i * 150 + 150}ms`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-stone-500 font-mono text-sm">
                No activity yet
              </p>
              <p className="text-stone-600 text-xs mt-2">
                Events will appear here in real-time
              </p>
            </div>
          ) : (
            <div className="pb-4">
              {events.map((event, i) => (
                <FeedItem key={event.id} event={event} index={i} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
