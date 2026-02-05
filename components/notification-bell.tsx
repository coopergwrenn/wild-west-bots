'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  read: boolean
  created_at: string
  related_transaction_id: string | null
}

const TYPE_ICONS: Record<string, string> = {
  PAYMENT_RECEIVED: '$',
  LISTING_CLAIMED: '!',
  DELIVERY_RECEIVED: '↓',
  DISPUTE_FILED: '⚠',
  DISPUTE_RESOLVED: '✓',
  REVIEW_RECEIVED: '★',
  WITHDRAWAL_COMPLETED: '↗',
  SYSTEM: '●',
}

const TYPE_COLORS: Record<string, string> = {
  PAYMENT_RECEIVED: 'bg-green-500/20 text-green-400',
  LISTING_CLAIMED: 'bg-blue-500/20 text-blue-400',
  DELIVERY_RECEIVED: 'bg-purple-500/20 text-purple-400',
  DISPUTE_FILED: 'bg-red-500/20 text-red-400',
  DISPUTE_RESOLVED: 'bg-green-500/20 text-green-400',
  REVIEW_RECEIVED: 'bg-amber-500/20 text-amber-400',
  WITHDRAWAL_COMPLETED: 'bg-[#c9a882]/20 text-[#c9a882]',
  SYSTEM: 'bg-stone-500/20 text-stone-400',
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/notifications?limit=20')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unread_count || 0)
      }
    } catch {
      // Silently fail - user may not be authenticated
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount and poll every 30s
  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  async function markAllRead() {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // ignore
    }
  }

  function handleToggle() {
    const willOpen = !isOpen
    setIsOpen(willOpen)
    if (willOpen && unreadCount > 0) {
      markAllRead()
    }
  }

  function getNotifLink(notif: Notification): string | null {
    if (notif.related_transaction_id) {
      return `/transactions/${notif.related_transaction_id}`
    }
    return null
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="p-2 text-stone-400 hover:text-[#c9a882] transition-colors relative"
        aria-label="Notifications"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-mono">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-[#1a1614] border border-stone-700 rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-stone-700 flex items-center justify-between">
            <h3 className="font-mono font-bold text-sm">Notifications</h3>
            {notifications.length > 0 && (
              <Link
                href="/dashboard"
                onClick={() => setIsOpen(false)}
                className="text-xs font-mono text-[#c9a882] hover:underline"
              >
                View all
              </Link>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <p className="p-4 text-stone-500 text-sm font-mono">Loading...</p>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-stone-500 text-sm font-mono">No notifications yet</p>
                <p className="text-stone-600 text-xs font-mono mt-1">
                  You&apos;ll be notified when payments, reviews, or claims happen.
                </p>
              </div>
            ) : (
              notifications.slice(0, 15).map(notif => {
                const link = getNotifLink(notif)
                const icon = TYPE_ICONS[notif.type] || '●'
                const colorClass = TYPE_COLORS[notif.type] || TYPE_COLORS.SYSTEM

                const content = (
                  <div className={`p-3 border-b border-stone-800/50 hover:bg-stone-900/30 transition-colors ${!notif.read ? 'bg-stone-900/50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${colorClass}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-sm font-bold truncate">{notif.title}</p>
                          <span className="text-xs font-mono text-stone-600 whitespace-nowrap">
                            {timeAgo(notif.created_at)}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-stone-400 mt-0.5 line-clamp-2">
                          {notif.message}
                        </p>
                      </div>
                    </div>
                  </div>
                )

                if (link) {
                  return (
                    <Link key={notif.id} href={link} onClick={() => setIsOpen(false)}>
                      {content}
                    </Link>
                  )
                }
                return <div key={notif.id}>{content}</div>
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
