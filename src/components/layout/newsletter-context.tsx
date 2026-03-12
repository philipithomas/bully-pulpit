'use client'

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type NewsletterState = string | null

const NewsletterContext = createContext<{
  newsletter: NewsletterState
  setNewsletter: (n: NewsletterState) => void
}>({ newsletter: null, setNewsletter: () => {} })

export function NewsletterProvider({ children }: { children: ReactNode }) {
  const [newsletter, setNewsletter] = useState<NewsletterState>(null)
  const value = useMemo(() => ({ newsletter, setNewsletter }), [newsletter])
  return (
    <NewsletterContext.Provider value={value}>
      {children}
    </NewsletterContext.Provider>
  )
}

export function useNewsletter() {
  return useContext(NewsletterContext)
}

export function SetNewsletter({ newsletter }: { newsletter: string | null }) {
  const { setNewsletter } = useNewsletter()
  useEffect(() => {
    setNewsletter(newsletter)
    return () => setNewsletter(null)
  }, [newsletter, setNewsletter])
  return null
}
