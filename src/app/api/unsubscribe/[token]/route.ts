import { type NextRequest, NextResponse } from 'next/server'
import { siteConfig } from '@/lib/config'

const ppUrl = siteConfig.printingPressUrl

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const res = await fetch(`${ppUrl}/api/v1/unsubscribe/${token}/preferences`, {
    cache: 'no-store',
  })

  if (!res.ok) {
    console.error(
      `[unsubscribe] GET preferences failed for token=${token}: ${res.status}`
    )
    return NextResponse.json(
      { error: 'Invalid or expired token' },
      { status: res.status }
    )
  }

  const data = await res.json()
  return NextResponse.json(data)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await request.json()
  console.log(`[unsubscribe] PATCH preferences for token=${token}:`, body)

  const res = await fetch(`${ppUrl}/api/v1/unsubscribe/${token}/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })

  if (!res.ok) {
    console.error(
      `[unsubscribe] PATCH failed for token=${token}: ${res.status}`
    )
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: res.status }
    )
  }

  const data = await res.json()
  console.log(`[unsubscribe] Preferences updated for token=${token}`)
  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  console.log(`[unsubscribe] DELETE account for token=${token}`)

  const res = await fetch(`${ppUrl}/api/v1/unsubscribe/${token}/account`, {
    method: 'DELETE',
    cache: 'no-store',
  })

  if (!res.ok) {
    console.error(
      `[unsubscribe] DELETE failed for token=${token}: ${res.status}`
    )
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: res.status }
    )
  }

  const data = await res.json()
  console.log(`[unsubscribe] Account deleted for token=${token}`)
  return NextResponse.json(data)
}
