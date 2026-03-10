'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'

export function MemberMenu() {
  const { user, loading, logout } = useAuthContext()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading) return null

  if (!user) {
    return (
      <a
        href="#subscribe"
        className="text-[13px] font-semibold tracking-[0.04em] uppercase text-gray-700 hover:text-gray-900 transition-colors"
      >
        Sign in
      </a>
    )
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-700 text-xs font-semibold uppercase hover:bg-gray-300 transition-colors"
      >
        {user.name?.[0] ?? user.email[0]}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-sm shadow-lg py-1 z-50">
          <div className="px-4 py-2 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {user.name ?? user.email}
            </p>
            {user.name && (
              <p className="text-xs text-gray-500 truncate">{user.email}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              logout()
              setOpen(false)
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-050 transition-colors"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
