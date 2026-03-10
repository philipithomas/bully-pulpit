import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

export async function PATCH(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get('bp_token')?.value

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let uuid: string
  try {
    const secret = new TextEncoder().encode(siteConfig.jwtSecret)
    const { payload } = await jwtVerify(token, secret)
    uuid = payload.sub as string
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const body = await request.json()

  try {
    const res = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers/${uuid}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': siteConfig.m2mApiKey,
        },
        body: JSON.stringify(body),
      }
    )

    if (!res.ok) {
      const data = await res.json()
      return NextResponse.json(
        { error: data.error ?? 'Update failed' },
        { status: res.status }
      )
    }

    const subscriber = await res.json()
    return NextResponse.json({ subscriber })
  } catch {
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}
