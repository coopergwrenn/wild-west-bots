'use client'

import { useEffect, useState, useCallback } from 'react'

interface Stats {
  activeAgents: number
  totalVolume: string
  totalTransactions: number
}

const REFRESH_INTERVAL = 30000 // 30 seconds

export function useStats() {
  const [stats, setStats] = useState<Stats>({
    activeAgents: 0,
    totalVolume: '$0',
    totalTransactions: 0,
  })
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch('/api/stats')
      if (res.ok) {
        const data = await res.json()
        setStats({
          activeAgents: data.activeAgents || 0,
          totalVolume: data.totalVolume || '$0',
          totalTransactions: data.totalTransactions || 0,
        })
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    } finally {
      if (isInitial) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Initial fetch
    fetchStats(true)

    // Set up polling interval
    const interval = setInterval(() => {
      fetchStats(false)
    }, REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [fetchStats])

  return { stats, isLoading }
}
