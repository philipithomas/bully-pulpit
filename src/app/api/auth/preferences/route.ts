import { jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

async function getUuid(): Promise<string | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('bp_token')?.value
  if (!token) return null

  try {
    const secret = new TextEncoder().encode(siteConfig.jwtSecret)
    const { payload } = await jwtVerify(token, secret)
    return payload.sub as string
  } catch {
    return null
  }
}

export async function GET() {
  const uuid = await getUuid()
  if (!uuid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers/${uuid}`,
      {
        headers: { 'x-api-key': siteConfig.m2mApiKey },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      console.error(`[auth/preferences] GET failed for ${uuid}: ${res.status}`)
      return NextResponse.json(
        { error: 'Failed to load preferences' },
        { status: res.status }
      )
    }

    const subscriber = await res.json()
    return NextResponse.json({
      email: subscriber.email,
      subscribed_contraption: subscriber.subscribed_contraption,
      subscribed_workshop: subscriber.subscribed_workshop,
      subscribed_postcard: subscriber.subscribed_postcard,
    })
  } catch (err) {
    console.error('[auth/preferences] GET network error:', err)
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}

export async function PATCH(request: Request) {
  const uuid = await getUuid()
  if (!uuid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      const data = await res.json()
      console.error(
        `[auth/preferences] PATCH failed for ${uuid}: ${res.status} ${data.error}`
      )
      return NextResponse.json(
        { error: data.error ?? 'Update failed' },
        { status: res.status }
      )
    }

    const subscriber = await res.json()
    return NextResponse.json({ subscriber })
  } catch (err) {
    console.error('[auth/preferences] PATCH network error:', err)
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}

export async function DELETE() {
  const uuid = await getUuid()
  if (!uuid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const res = await fetch(
      `${siteConfig.printingPressUrl}/api/v1/subscribers/${uuid}`,
      {
        method: 'DELETE',
        headers: { 'x-api-key': siteConfig.m2mApiKey },
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      console.error(
        `[auth/preferences] DELETE failed for ${uuid}: ${res.status}`
      )
      return NextResponse.json(
        { error: 'Failed to delete account' },
        { status: res.status }
      )
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.delete('bp_token')
    response.cookies.delete('bp_has_session')
    return response
  } catch (err) {
    console.error('[auth/preferences] DELETE network error:', err)
    return NextResponse.json(
      { error: 'Unable to reach subscription service' },
      { status: 502 }
    )
  }
}
