import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete('bp_token')
  response.cookies.delete('bp_has_session')
  return response
}
