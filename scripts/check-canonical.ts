/**
 * Post-build regression guard: every indexable, prerendered page must carry
 * exactly one <link rel="canonical"> pointing at the production host.
 *
 * Why a post-build HTML scan instead of a per-route unit test: it derives the
 * indexable surface from the build output itself, so it stays correct as
 * content grows (every new MDX post emits an HTML file that this check picks
 * up) with zero per-route maintenance. Two posts once shipped without a
 * canonical tag (PR #98); this fails the build instead of silently shipping
 * the next regression.
 *
 * The indexable / noindex partition is self-deriving — there is no hardcoded
 * list to drift out of sync:
 *   - A page that declares <meta name="robots" content="noindex…"> is exempt
 *     (the noindex utility pages: /account, /unsubscribe, and the framework
 *     error boundaries). The exemption is itself asserted: an exempt page must
 *     actually emit the noindex tag, so silently dropping a page's noindex
 *     would flip it into the "must have a canonical" set.
 *   - Every other page must have exactly one canonical on the production host.
 *
 * Framework-internal artifacts (_not-found, _global-error) are exempt: their
 * basenames start with an underscore and they are never indexable.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { siteConfig } from '@/lib/config'

const BUILD_HTML_DIR = join(process.cwd(), '.next', 'server', 'app')

// siteConfig.url resolves to https://www.philipithomas.com for a production
// build, a local build (NODE_ENV !== development), or CI — i.e. every place
// this check runs. metadataBase strips the trailing slash, so the home-page
// canonical is the bare origin.
const EXPECTED_ORIGIN = siteConfig.url

function listHtmlFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listHtmlFiles(full))
    } else if (entry.name.endsWith('.html')) {
      out.push(full)
    }
  }
  return out
}

function isFrameworkArtifact(file: string): boolean {
  // _not-found.html, _global-error.html — never indexable.
  return relative(BUILD_HTML_DIR, file)
    .split('/')
    .some((segment) => segment.startsWith('_'))
}

function isNoindex(html: string): boolean {
  return /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)
}

function canonicalHrefs(html: string): string[] {
  const matches = html.matchAll(
    /<link[^>]+rel="canonical"[^>]*?href="([^"]*)"[^>]*>/gi
  )
  return [...matches].map((m) => m[1])
}

function main(): void {
  let files: string[]
  try {
    files = listHtmlFiles(BUILD_HTML_DIR)
  } catch {
    console.error(
      `No build output at ${relative(process.cwd(), BUILD_HTML_DIR)}. Run \`pnpm build\` first.`
    )
    process.exit(1)
  }

  if (files.length === 0) {
    console.error('No prerendered HTML found. Did the build emit static pages?')
    process.exit(1)
  }

  const errors: string[] = []
  let indexable = 0
  let exempt = 0

  for (const file of files) {
    const rel = relative(BUILD_HTML_DIR, file)
    const html = readFileSync(file, 'utf8')

    if (isFrameworkArtifact(file) || isNoindex(html)) {
      exempt += 1
      // Assert the exemption rather than trusting it: a noindex page must
      // actually carry the tag, and must not also claim a canonical (mixed
      // signals confuse crawlers).
      if (!isFrameworkArtifact(file) && canonicalHrefs(html).length > 0) {
        errors.push(`${rel}: noindex page also declares a canonical link`)
      }
      continue
    }

    indexable += 1
    const hrefs = canonicalHrefs(html)

    if (hrefs.length === 0) {
      errors.push(`${rel}: indexable page has no <link rel="canonical">`)
      continue
    }
    if (hrefs.length > 1) {
      errors.push(
        `${rel}: ${hrefs.length} canonical links (expected exactly one)`
      )
      continue
    }

    const href = hrefs[0]
    if (!href.startsWith(`${EXPECTED_ORIGIN}/`) && href !== EXPECTED_ORIGIN) {
      errors.push(
        `${rel}: canonical "${href}" is not on the production host ${EXPECTED_ORIGIN}`
      )
    }
  }

  if (errors.length > 0) {
    console.error('Canonical check failed:\n')
    for (const error of errors) {
      console.error(`  - ${error}`)
    }
    console.error(
      `\n${errors.length} problem(s) across ${files.length} prerendered page(s).`
    )
    process.exit(1)
  }

  console.log(
    `Canonical check passed: ${indexable} indexable page(s) carry a canonical, ${exempt} noindex/framework page(s) exempt.`
  )
}

main()
