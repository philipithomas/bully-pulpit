import type { Metadata } from 'next'
import Link from 'next/link'
import { feedDiscovery } from '@/lib/feeds/discovery'
import { siteIdentity } from '@/lib/site-identity'

const endpoint = `${siteIdentity.productionUrl}/api/mcp`

const linkClassName =
  'underline decoration-gray-300 underline-offset-4 transition-colors duration-300 hover:text-gray-950 hover:decoration-gray-950'

export const metadata: Metadata = {
  title: 'MCP server',
  description:
    "Connect an AI client to search, list, and read Philip Ilic Thomas's public writing.",
  alternates: { canonical: '/mcp', types: feedDiscovery() },
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-4 overflow-x-auto bg-gray-950 px-4 py-3 font-mono text-gray-100 text-sm leading-relaxed">
      <code>{children}</code>
    </pre>
  )
}

export default function McpPage() {
  return (
    <article className="bg-gray-050" data-bg="gray-050">
      <div className="container py-16 md:py-20">
        <div className="max-w-3xl">
          <header className="mb-14">
            <h1 className="font-sans font-semibold text-4xl text-gray-950 tracking-tight sm:text-5xl lg:text-6xl">
              MCP server
            </h1>
            <p className="mt-5 max-w-2xl font-serif text-gray-600 text-xl leading-relaxed">
              Connect Claude, ChatGPT, or another compatible AI client to
              search, list, and read the public writing on this site. The server
              is read-only and does not require an account, API key, or other
              authentication.
            </p>
          </header>

          <div className="space-y-14">
            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                Endpoint
              </h2>
              <p className="mt-5 font-serif text-gray-700 text-lg leading-relaxed">
                Add this URL as a remote Streamable HTTP MCP server. No
                authorization header is needed.
              </p>
              <CodeBlock>{endpoint}</CodeBlock>
            </section>

            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                Tools
              </h2>
              <dl className="mt-6 space-y-8">
                <div>
                  <dt>
                    <code className="font-mono text-gray-950 text-sm">
                      search(query: string)
                    </code>
                  </dt>
                  <dd className="mt-2 font-serif text-gray-700 text-lg leading-relaxed">
                    Search public posts and site pages by subject. A natural
                    language query must be between 2 and 300 characters. The
                    tool returns up to ten titles, citation URLs, and stable IDs
                    for use with <code className="font-mono">fetch</code>.
                  </dd>
                </div>

                <div>
                  <dt>
                    <code className="font-mono text-gray-950 text-sm">
                      fetch(id: string)
                    </code>
                  </dt>
                  <dd className="mt-2 font-serif text-gray-700 text-lg leading-relaxed">
                    Read the public text and metadata for one result returned by{' '}
                    <code className="font-mono">search</code> or{' '}
                    <code className="font-mono">list_posts</code>, capped at
                    50,000 characters. It accepts a site content ID, not an
                    arbitrary URL.
                  </dd>
                </div>

                <div>
                  <dt>
                    <code className="font-mono text-gray-950 text-sm">
                      list_posts(limit?: number, offset?: number, newsletter?:
                      "contraption" | "workshop" | "postcard" | "tidbits" |
                      "tsundoku")
                    </code>
                  </dt>
                  <dd className="mt-2 font-serif text-gray-700 text-lg leading-relaxed">
                    List published posts in newest-first order. The default
                    limit is 5 and the maximum is 10. Offset defaults to 0.
                    Newsletter may be{' '}
                    <code className="font-mono">contraption</code>,{' '}
                    <code className="font-mono">workshop</code>,{' '}
                    <code className="font-mono">postcard</code>,{' '}
                    <code className="font-mono">tidbits</code>, or{' '}
                    <code className="font-mono">tsundoku</code>; omit it to
                    include every newsletter.
                  </dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                Claude
              </h2>
              <ol className="mt-5 list-decimal space-y-3 pl-6 font-serif text-gray-700 text-lg leading-relaxed marker:font-sans">
                <li>
                  In Claude on the web, open Settings, then Connectors, and
                  choose Add custom connector. Your plan or workspace
                  administrator may control whether custom connectors are
                  available.
                </li>
                <li>
                  Enter <code className="font-mono">{endpoint}</code> as the
                  remote MCP server URL and select no authentication.
                </li>
                <li>
                  Connect the server, then confirm that{' '}
                  <code className="font-mono">search</code>,{' '}
                  <code className="font-mono">fetch</code>, and{' '}
                  <code className="font-mono">list_posts</code> appear.
                </li>
              </ol>
              <p className="mt-4 font-serif text-gray-700 text-lg leading-relaxed">
                See Claude's{' '}
                <a
                  href="https://claude.com/docs/connectors/building/testing"
                  className={linkClassName}
                >
                  connector testing guide
                </a>{' '}
                for the current custom-connector flow.
              </p>
            </section>

            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                Claude Code
              </h2>
              <p className="mt-5 font-serif text-gray-700 text-lg leading-relaxed">
                Add the server at user scope to make it available across your
                Claude Code projects:
              </p>
              <CodeBlock>{`claude mcp add --transport http --scope user philipithomas ${endpoint}`}</CodeBlock>
              <p className="mt-4 font-serif text-gray-700 text-lg leading-relaxed">
                Run{' '}
                <code className="font-mono">claude mcp get philipithomas</code>{' '}
                to inspect the connection, or use{' '}
                <code className="font-mono">/mcp</code> inside Claude Code to
                check its status. See the{' '}
                <a
                  href="https://code.claude.com/docs/en/mcp"
                  className={linkClassName}
                >
                  Claude Code MCP documentation
                </a>{' '}
                for other scopes and configuration formats.
              </p>
            </section>

            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                ChatGPT developer mode
              </h2>
              <ol className="mt-5 list-decimal space-y-3 pl-6 font-serif text-gray-700 text-lg leading-relaxed marker:font-sans">
                <li>
                  In ChatGPT on the web, open Settings, Apps, then Advanced
                  settings, and enable Developer mode. A managed workspace may
                  require an administrator to enable connected-data developer
                  access first.
                </li>
                <li>
                  Under Settings, Apps, choose Create. Enter{' '}
                  <code className="font-mono">{endpoint}</code> as the MCP
                  endpoint and select no authentication.
                </li>
                <li>
                  Scan the tools, confirm that{' '}
                  <code className="font-mono">search</code>,{' '}
                  <code className="font-mono">fetch</code>, and{' '}
                  <code className="font-mono">list_posts</code> appear, then
                  create and enable the app.
                </li>
              </ol>
              <p className="mt-4 font-serif text-gray-700 text-lg leading-relaxed">
                Availability and workspace permissions vary by ChatGPT plan.
                OpenAI maintains the current{' '}
                <a
                  href="https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt-beta"
                  className={linkClassName}
                >
                  developer mode instructions
                </a>
                .
              </p>
            </section>

            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                Example prompts
              </h2>
              <ul className="mt-5 space-y-4 font-serif text-gray-700 text-lg leading-relaxed">
                <li>
                  “What has Philip written about building software with AI? Read
                  the most relevant posts and cite them.”
                </li>
                <li>
                  “What is Philip’s latest Workshop post? Summarize it and link
                  to the source.”
                </li>
                <li>
                  “Find Philip’s writing about coffee and restaurants, then
                  compare the places he recommends.”
                </li>
                <li>
                  “List the five most recent posts across every newsletter.”
                </li>
              </ul>
            </section>

            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                Troubleshooting
              </h2>
              <div className="mt-5 space-y-5 font-serif text-gray-700 text-lg leading-relaxed">
                <p>
                  If the tools do not appear, confirm that the endpoint ends in{' '}
                  <code className="font-mono">/api/mcp</code>, then reconnect or
                  refresh the client’s tool list. Claude Code reports the
                  connection under <code className="font-mono">/mcp</code>.
                  ChatGPT provides a Scan tools action while creating the app.
                </p>
                <p>
                  The server never asks for a login. If a client presents an
                  authentication choice, select no authentication and do not add
                  a bearer token.
                </p>
                <p>
                  Search is rate-limited. If a search is temporarily limited,
                  wait before trying again. For chronological questions, say
                  “latest” or “recent” and name a newsletter when you want one
                  publication only.
                </p>
              </div>
            </section>

            <section>
              <h2 className="font-sans font-semibold text-2xl text-gray-950 tracking-tight sm:text-3xl">
                Privacy and terms
              </h2>
              <p className="mt-5 font-serif text-gray-700 text-lg leading-relaxed">
                The site does not create an account or store MCP requests in its
                application database. The AI service you choose processes your
                prompt and the public content returned by these tools; semantic
                search may send the search query through Vercel AI Gateway to
                Google for an embedding. Read the{' '}
                <Link
                  href="/privacy#public-mcp-server"
                  className={linkClassName}
                >
                  MCP privacy details
                </Link>{' '}
                and{' '}
                <Link href="/terms#public-mcp-server" className={linkClassName}>
                  terms of use
                </Link>
                , or{' '}
                <Link href="/contact" className={linkClassName}>
                  get in touch
                </Link>{' '}
                with a question.
              </p>
            </section>
          </div>
        </div>
      </div>
    </article>
  )
}
