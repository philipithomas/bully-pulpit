import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return NextResponse.next()
  }

  return NextResponse.rewrite(new URL('/api/mcp', request.url))
}

export const config = {
  matcher: '/mcp',
}
