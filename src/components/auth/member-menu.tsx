'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuthContext } from '@/components/auth/auth-provider'
import { ArrowIcon } from '@/components/ui/arrow-icon'
import { gravatarUrl } from '@/lib/gravatar'
import { useAuthModal } from '@/stores/auth-store'

// No display utility here: each usage sets its own, so the CSS-driven
// hidden/inline-flex swap in the unresolved state stays deterministic.
const AVATAR_CIRCLE_CLASS =
  'relative items-center justify-center w-8 h-8 rounded-full bg-gray-200 text-gray-600 overflow-hidden'

function PersonIcon() {
  return (
    <svg
      className="w-5 h-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
      />
    </svg>
  )
}

/** Non-interactive stand-in with the exact shape of the member avatar. */
function AvatarPlaceholder({
  className = 'inline-flex',
}: {
  className?: string
}) {
  return (
    <div className={`${AVATAR_CIRCLE_CLASS} ${className}`} aria-hidden="true">
      <PersonIcon />
    </div>
  )
}

function SignedOutControls({ className }: { className?: string }) {
  const { openModal } = useAuthModal()
  return (
    <div className={`flex items-center gap-4 md:gap-5 ${className ?? ''}`}>
      <button
        type="button"
        onClick={openModal}
        className="hidden sm:inline-block px-3 py-2 font-sans text-[13px] font-medium tracking-[0.04em] uppercase text-gray-700 hover:text-gray-900 transition-colors duration-300"
      >
        Sign in
      </button>
      <button type="button" onClick={openModal} className="btn btn-primary">
        <span className="btn-text">Subscribe</span>
        <span className="btn-arrow">
          <ArrowIcon className="w-4 h-4" />
        </span>
      </button>
    </div>
  )
}

export function MemberMenu() {
  const { user, hasSession, loading, logout } = useAuthContext()
  const [open, setOpen] = useState(false)
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [avatarLoaded, setAvatarLoaded] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarSrc = useMemo(
    () => (user ? gravatarUrl(user.email, 64) : null),
    [user]
  )

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

  // Server pass and hydration: render both presentations and let the
  // pre-paint session hint in the root layout pick the visible one, so the
  // first paint is already correct and nothing swaps on screen later.
  if (hasSession === null) {
    return (
      <>
        <SignedOutControls className="[[data-member]_&]:hidden" />
        <AvatarPlaceholder className="hidden [[data-member]_&]:inline-flex" />
      </>
    )
  }

  // Session cookie present and /api/auth/me still in flight: hold the avatar
  // shape that is already on screen instead of flashing the sign-in controls.
  if (!user && hasSession && loading) {
    return <AvatarPlaceholder />
  }

  if (!user) {
    // Resolved signed out. Fade in only when the avatar placeholder was on
    // screen (stale cookie, or right after sign out). Anonymous visitors keep
    // the controls they have seen since first paint, with no animation. This
    // resolves once per full page load: the header lives in the persistent
    // layout, so client-side navigations never replay it.
    return (
      <SignedOutControls
        className={hasSession ? 'animate-in fade-in duration-200' : undefined}
      />
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
        className={`${AVATAR_CIRCLE_CLASS} inline-flex hover:opacity-80 transition-opacity duration-300`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Open member menu"
      >
        <PersonIcon />
        {avatarSrc && !avatarFailed && (
          /* Layered over the icon and faded in on load, so the gravatar
             arrives gently instead of popping over the placeholder. */
          // biome-ignore lint/performance/noImgElement: external Gravatar, not a local asset
          <img
            src={avatarSrc}
            alt=""
            width={32}
            height={32}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
              avatarLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setAvatarLoaded(true)}
            onError={() => setAvatarFailed(true)}
          />
        )}
      </button>
      <div
        className={`absolute right-0 top-full pt-3 z-50 ${
          open ? '' : 'pointer-events-none'
        }`}
      >
        <div
          className={`w-56 border border-gray-200 bg-white shadow-lg overflow-hidden transition duration-150 ease-out ${
            open
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-1 scale-95'
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
          {user.isAdmin && (
            <Link
              href="/printing-press"
              className="block px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-075 border-t border-gray-100 transition-colors duration-200"
              onClick={() => setOpen(false)}
            >
              Printing press
            </Link>
          )}
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
    </div>
  )
}
