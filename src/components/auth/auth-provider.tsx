'use client'

import {
  createContext,
  type Dispatch,
  type SetStateAction,
  useContext,
} from 'react'
import { type AuthUser, useAuth } from '@/hooks/use-auth'
import type { SubscriberPreferences } from '@/lib/auth/preferences'

interface AuthContextType {
  user: AuthUser | null
  preferences: SubscriberPreferences | null
  setPreferences: Dispatch<SetStateAction<SubscriberPreferences | null>>
  hasSession: boolean | null
  loading: boolean
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  preferences: null,
  setPreferences: () => {},
  hasSession: null,
  loading: true,
  logout: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth()
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
}

export function useAuthContext() {
  return useContext(AuthContext)
}
