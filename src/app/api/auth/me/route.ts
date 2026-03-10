import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('bp_token')?.value

  if (!token) {
    return NextResponse.json({ user: null })
  }

  try {
    const secret = new TextEncoder().encode(siteConfig.jwtSecret)
    const { payload } = await jwtVerify(token, secret)
    return NextResponse.json({
      user: {
        uuid: payload.sub,
        email: payload.email,
        name: payload.name,
      },
    })
  } catch {
    const response = NextResponse.json({ user: null })
    response.cookies.delete('bp_token')
    return response
  }
}
