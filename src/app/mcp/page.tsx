import type { Metadata } from 'next'
import Link from 'next/link'
import { siteConfig } from '@/lib/config'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { mcpTools } from '@/lib/mcp/posts'

const endpoint = `${siteConfig.url}/mcp`
const apiDocs = `${siteConfig.url}/api`
const openApiSpec = `${siteConfig.url}/openapi.json`
const wellKnownOpenApiSpec = `${siteConfig.url}/.well-known/openapi.json`

export const metadata: Metadata = {
  title: 'MCP server',
  description:
    'Install the philipithomas.com MCP server to search, list, and read published posts from an AI client.',
  alternates: { canonical: '/mcp', types: feedDiscovery() },
}

export default function McpPage() {
  const jsonExample = JSON.stringify(
    {
      mcpServers: {
        philipithomas: {
          type: 'http',
          url: endpoint,
        },
      },
    },
    null,
    2
  )

  const curlExample = `curl -s ${endpoint} \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`

  const vercelAiSdkExample = `import { createMCPClient } from '@ai-sdk/mcp'

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: '${endpoint}',
  },
})

const tools = await mcpClient.tools()`

  const apiExample = `curl -s '${siteConfig.url}/api/public/search?q=workshop&limit=5'`

  return (
    <div className="bg-gray-050" data-bg="gray-050">
      <div className="container py-12 md:py-16">
        <div className="max-w-3xl">
          <p className="font-mono text-xs text-gray-500 mb-4">
            Model Context Protocol
          </p>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-gray-950 mb-4">
            MCP server
          </h1>
          <p className="font-serif text-xl leading-snug text-gray-700 mb-8">
            Connect an AI client to the public writing archive. The server
            exposes read-only tools for listing, searching, and reading posts.
          </p>

          <section className="border-t border-gray-200 py-8">
            <h2 className="font-serif text-2xl text-gray-950 mb-4">Endpoint</h2>
            <p className="text-gray-700 leading-snug mb-4">
              Add this URL as a remote HTTP MCP server. If your client asks for
              a transport, choose Streamable HTTP.
            </p>
            <pre className="overflow-x-auto bg-gray-900 text-white p-4 text-sm leading-relaxed">
              <code>{endpoint}</code>
            </pre>
          </section>

          <section className="border-t border-gray-200 py-8">
            <h2 className="font-serif text-2xl text-gray-950 mb-4">Install</h2>
            <p className="text-gray-700 leading-snug mb-4">
              Some clients accept JSON configuration. Use this shape when your
              client asks for named MCP servers, adapting field names as needed
              for that client.
            </p>
            <pre className="overflow-x-auto bg-gray-900 text-white p-4 text-sm leading-relaxed">
              <code>{jsonExample}</code>
            </pre>
          </section>

          <section className="border-t border-gray-200 py-8">
            <h2 className="font-serif text-2xl text-gray-950 mb-4">Tools</h2>
            <ul className="divide-y divide-gray-200">
              {mcpTools.map((tool) => (
                <li key={tool.name} className="py-4">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
                    <code className="font-mono text-sm text-gray-950">
                      {tool.name}
                    </code>
                    <p className="text-gray-700 leading-snug">
                      {tool.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="border-t border-gray-200 py-8">
            <h2 className="font-serif text-2xl text-gray-950 mb-4">
              Vercel AI SDK
            </h2>
            <p className="text-gray-700 leading-snug mb-4">
              Use the AI SDK HTTP transport when connecting from a Vercel app or
              another production host. This server does not require auth
              headers.
            </p>
            <pre className="overflow-x-auto bg-gray-900 text-white p-4 text-sm leading-relaxed">
              <code>{vercelAiSdkExample}</code>
            </pre>
          </section>

          <section className="border-t border-gray-200 py-8">
            <h2 className="font-serif text-2xl text-gray-950 mb-4">
              Public API
            </h2>
            <p className="text-gray-700 leading-snug mb-4">
              The same read-only archive is exposed as a no-auth public REST API
              with an OpenAPI spec and Swagger UI.
            </p>
            <div className="space-y-3 text-gray-700 leading-snug mb-4">
              <p>
                <Link
                  href="/api"
                  className="underline underline-offset-2 hover:text-gray-950 transition-colors"
                >
                  Swagger UI
                </Link>
                : <code className="font-mono">{apiDocs}</code>
              </p>
              <p>
                <Link
                  href="/openapi.json"
                  className="underline underline-offset-2 hover:text-gray-950 transition-colors"
                >
                  OpenAPI spec
                </Link>
                : <code className="font-mono">{openApiSpec}</code>
              </p>
              <p>
                <Link
                  href="/.well-known/openapi.json"
                  className="underline underline-offset-2 hover:text-gray-950 transition-colors"
                >
                  Well-known spec
                </Link>
                : <code className="font-mono">{wellKnownOpenApiSpec}</code>
              </p>
            </div>
            <pre className="overflow-x-auto bg-gray-900 text-white p-4 text-sm leading-relaxed">
              <code>{apiExample}</code>
            </pre>
          </section>

          <section className="border-t border-gray-200 py-8">
            <h2 className="font-serif text-2xl text-gray-950 mb-4">Check</h2>
            <p className="text-gray-700 leading-snug mb-4">
              This command asks the server for its tool list. A successful
              response includes <code className="font-mono">list_posts</code>,{' '}
              <code className="font-mono">search_posts</code>, and{' '}
              <code className="font-mono">read_post</code>.
            </p>
            <pre className="overflow-x-auto bg-gray-900 text-white p-4 text-sm leading-relaxed">
              <code>{curlExample}</code>
            </pre>
          </section>

          <section className="border-t border-gray-200 pt-8">
            <p className="text-gray-600 leading-snug">
              The same posts are available in the{' '}
              <Link
                href="/sitemap"
                className="underline underline-offset-2 hover:text-gray-950 transition-colors"
              >
                human sitemap
              </Link>
              , public search, and RSS feeds.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
