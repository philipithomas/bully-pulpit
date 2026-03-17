'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'postcard-seen-latest'

interface Props {
  href: string
  latestKey: string
  label: string
}

export function PostcardLatestLink({ href, latestKey, label }: Props) {
  const [seen, setSeen] = useState(true) // default true to avoid flash on mount

  useEffect(() => {
    setSeen(localStorage.getItem(STORAGE_KEY) === latestKey)
  }, [latestKey])

  function handleClick() {
    localStorage.setItem(STORAGE_KEY, latestKey)
    setSeen(true)
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      className="relative flex flex-col items-center justify-center p-3 bg-indigo text-white rounded-sm hover:bg-indigo/90 transition-colors text-center"
    >
      {!seen && (
        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#C45B4A]/70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#C45B4A]" />
        </span>
      )}
      <span className="font-mono text-xs font-semibold">{label}</span>
    </Link>
  )
}
