'use client'

import { useCallback, useEffect, useState } from 'react'

interface User {
  uuid: string
  email: string
  name: string | null
}

function hasSessionCookie(): boolean {
  return document.cookie
    .split(';')
    .some((c) => c.trim().startsWith('bp_has_session='))
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hasSessionCookie()) {
      setLoading(false)
      return
    }

    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    // biome-ignore lint/suspicious/noDocumentCookie: clearing session indicator
    document.cookie = 'bp_has_session=; path=/; max-age=0'
    setUser(null)
  }, [])

  return { user, loading, logout }
}
