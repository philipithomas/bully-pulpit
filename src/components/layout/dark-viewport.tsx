'use client'

import { useEffect } from 'react'

export function DarkViewport() {
  useEffect(() => {
    document.body.classList.add('dark-viewport')
    return () => document.body.classList.remove('dark-viewport')
  }, [])
  return null
}
