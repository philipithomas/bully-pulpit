import { NextResponse } from 'next/server'

export async function POST(_request: Request) {
  return NextResponse.json(
    { error: 'Tsundoku is archived and no longer accepts subscriptions.' },
    { status: 410 }
  )
}
