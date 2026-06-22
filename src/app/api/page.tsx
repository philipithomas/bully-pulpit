import type { Metadata } from 'next'
import Link from 'next/link'
import { SwaggerUi } from '@/components/api/swagger-ui'
import { feedDiscovery } from '@/lib/feeds/discovery'

export const metadata: Metadata = {
  title: 'Public API',
  description:
    'Explore the read-only philipithomas.com public API with Swagger UI.',
  alternates: { canonical: '/api', types: feedDiscovery() },
}

export default function ApiPage() {
  return (
    <div className="bg-gray-050" data-bg="gray-050">
      <div className="container py-12 md:py-16">
        <div className="max-w-3xl mb-10">
          <p className="font-mono text-xs text-gray-500 mb-4">OpenAPI 3.1</p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-950 mb-4">
            Public API
          </h1>
          <p className="font-serif text-xl leading-snug text-gray-700 mb-6">
            Browse the read-only API for the public writing archive. No
            authentication is required.
          </p>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700">
            <Link
              href="/openapi.json"
              className="underline underline-offset-2 hover:text-gray-950 transition-colors"
            >
              OpenAPI spec
            </Link>
            <Link
              href="/.well-known/openapi.json"
              className="underline underline-offset-2 hover:text-gray-950 transition-colors"
            >
              Well-known spec
            </Link>
            <Link
              href="/mcp"
              className="underline underline-offset-2 hover:text-gray-950 transition-colors"
            >
              MCP server
            </Link>
          </div>
        </div>

        <div className="border border-gray-200 bg-white">
          <SwaggerUi specUrl="/openapi.json" />
        </div>
      </div>
    </div>
  )
}
