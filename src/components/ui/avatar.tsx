'use client'

import { useMemo, useState } from 'react'
import { gravatarUrl } from '@/lib/gravatar'
import { cn } from '@/lib/utils'

function initialsFor(email: string, name?: string | null): string {
  const trimmed = name?.trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/)
    const first = parts[0]?.[0] ?? ''
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
    return (first + last).toUpperCase() || trimmed[0].toUpperCase()
  }
  const local = email.split('@')[0] ?? email
  return local.slice(0, 2).toUpperCase()
}

/**
 * Round avatar that shows the recipient's Gravatar if one exists, falling back
 * to their initials. gravatarUrl uses `d=404`, so a missing Gravatar 404s and
 * trips onError → initials (same pattern as the member menu).
 */
export function Avatar({
  email,
  name,
  size = 40,
  className,
}: {
  email: string
  name?: string | null
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  // Request 2× for crisp rendering on retina.
  const src = useMemo(() => gravatarUrl(email, size * 2), [email, size])
  const initials = useMemo(() => initialsFor(email, name), [email, name])

  return (
    <span
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-gray-100 font-medium text-gray-500',
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {failed ? (
        initials
      ) : (
        // biome-ignore lint/performance/noImgElement: external Gravatar, not a local asset
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  )
}
