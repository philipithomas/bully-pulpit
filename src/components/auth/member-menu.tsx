'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { useAuthModal } from '@/stores/auth-store'

export function MemberMenu() {
  const { user, loading, logout } = useAuthContext()
  const { openModal } = useAuthModal()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  if (loading) return null

  if (!user) {
    return (
      <div className="flex items-center gap-4 md:gap-5">
        <button
          type="button"
          onClick={openModal}
          className="inline-block px-3 py-2 font-sans text-[13px] font-medium tracking-[0.04em] uppercase text-gray-700 hover:text-gray-900 transition-colors duration-300"
        >
          Sign in
        </button>
        <button type="button" onClick={openModal} className="btn btn-primary">
          <span className="btn-text">Join</span>
          <span className="btn-arrow">
            <ArrowIcon className="w-4 h-4" />
          </span>
        </button>
      </div>
    )
  }

  return (
    <div
      className="relative"
      ref={menuRef}
      onMouseEnter={() => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          setOpen(true)
        }
      }}
      onMouseLeave={() => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 hover:opacity-80 transition-opacity duration-300"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Open member menu"
      >
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
          />
        </svg>
      </button>
      <div
        className={`absolute right-0 mt-3 w-56 border border-gray-200 bg-white shadow-lg overflow-hidden transition duration-150 ease-out z-50 ${
          open
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-1 scale-95 pointer-events-none'
        }`}
      >
        <div className="w-full px-4 pt-3 pb-3 border-b border-gray-100 text-xs font-medium text-gray-600 truncate">
          {user.email}
        </div>
        <Link
          href="/account"
          className="block px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-075 transition-colors duration-200"
          onClick={() => setOpen(false)}
        >
          Account
        </Link>
        <button
          type="button"
          onClick={() => {
            logout()
            setOpen(false)
          }}
          className="block w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-075 border-t border-gray-100 transition-colors duration-200"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
