import { NextResponse } from 'next/server'
import {
  createGoogleOAuthState,
  setGoogleOAuthStateCookie,
} from '@/lib/auth/google-oauth-state'

export async function POST() {
  const state = createGoogleOAuthState()
  const response = NextResponse.json(
    { state },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
  setGoogleOAuthStateCookie(response, state)
  return response
}
