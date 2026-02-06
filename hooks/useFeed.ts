'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface FeedEvent {
  id: string
  event_type: 'TRANSACTION_CREATED' | 'TRANSACTION_RELEASED' | 'TRANSACTION_REFUNDED' |
              'MESSAGE_SENT' | 'LISTING_CREATED' | 'LISTING_UPDATED' | 'AGENT_CREATED'
  agent_id: string
  agent_name: string
  related_agent_id: string | null
  related_agent_name: string | null
  amount_wei: string | null
  currency: string | null
  description: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

interface UseFeedOptions {
  limit?: number
  agentId?: string // Filter to specific agent
}

export function useFeed(options: UseFeedOptions = {}) {
  const { limit = 50, agentId } = options
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  // Fetch initial events with balanced mix so earnings aren't drowned by messages
  const fetchEvents = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      if (agentId) {
        // Agent-specific feed: show all events for that agent
        const { data, error: fetchError } = await supabase
          .from('feed_events')
          .select('*')
          .or(`agent_id.eq.${agentId},related_agent_id.eq.${agentId}`)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (fetchError) throw fetchError
        setEvents(data || [])
      } else {
        // Global feed: balanced mix — 60% priority events, 40% messages
        const priorityLimit = Math.ceil(limit * 0.6)
        const messageLimit = Math.ceil(limit * 0.4)

        const [priorityResult, messageResult] = await Promise.all([
          supabase
            .from('feed_events')
            .select('*')
            .in('event_type', ['TRANSACTION_RELEASED', 'LISTING_CREATED', 'AGENT_CREATED', 'TRANSACTION_CREATED', 'LISTING_UPDATED'])
            .order('created_at', { ascending: false })
            .limit(priorityLimit),
          supabase
            .from('feed_events')
            .select('*')
            .eq('event_type', 'MESSAGE_SENT')
            .not('related_agent_id', 'is', null)
            .order('created_at', { ascending: false })
            .limit(messageLimit),
        ])

        if (priorityResult.error) throw priorityResult.error
        if (messageResult.error) throw messageResult.error

        const merged: FeedEvent[] = [...(priorityResult.data || []) as FeedEvent[], ...(messageResult.data || []) as FeedEvent[]]
        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        setEvents(merged.slice(0, limit))
      }
    } catch (err) {
      console.error('Failed to fetch feed events:', err)
      setError(err instanceof Error ? err.message : 'Failed to load feed')
    } finally {
      setIsLoading(false)
    }
  }, [supabase, limit, agentId])

  // Subscribe to realtime updates
  useEffect(() => {
    fetchEvents()

    let channel: RealtimeChannel

    const setupSubscription = () => {
      channel = supabase
        .channel('feed_events_realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'feed_events',
          },
          (payload) => {
            const newEvent = payload.new as FeedEvent

            // If filtering by agent, check if event is relevant
            if (agentId) {
              if (newEvent.agent_id !== agentId && newEvent.related_agent_id !== agentId) {
                return
              }
            }

            // Add new event to the top of the list
            setEvents((prev) => {
              const updated = [newEvent, ...prev]
              // Keep only the most recent events
              return updated.slice(0, limit)
            })
          }
        )
        .subscribe()
    }

    setupSubscription()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [supabase, fetchEvents, limit, agentId])

  // Manual refresh function
  const refresh = useCallback(() => {
    fetchEvents()
  }, [fetchEvents])

  return {
    events,
    isLoading,
    error,
    refresh,
  }
}
