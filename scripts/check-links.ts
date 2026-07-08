import fs from 'node:fs'
import path from 'node:path'
import { getAllPosts, getPages } from '@/lib/content/loader'
import {
  checkDocument,
  collectAppRoutes,
  collectPublicFiles,
  countInternalLinks,
  type SiteIndex,
} from '@/lib/links/check'
import { getRedirects } from '@/lib/redirects'

/**
 * Fast, offline validation of every internal reference in content/ MDX:
 * markdown links, images, and JSX href/src attributes. A `/slug` link must
 * resolve to a published post or page, a real app route (static or dynamic),
 * a file under public/, or a next.config redirect whose destination resolves.
 * Query strings and fragments are stripped; fragment-only and external links
 * are skipped so this check stays offline and deterministic.
 *
 * Runs in CI after the content pipeline check. Deliberately not in the
 * pre-commit hook: commits stay fast, CI catches the breakage.
 */

const ROOT = process.cwd()
const CONTENT_DIR = path.join(ROOT, 'content')
const APP_DIR = path.join(ROOT, 'src/app')
const PUBLIC_DIR = path.join(ROOT, 'public')

/**
 * Intentional exceptions: links that the validator cannot prove but that are
 * known good (or knowingly dead in archived content). Matched against the raw
 * URL and the cleaned pathname. Keep each entry commented.
 */
const ALLOWED_LINKS: string[] = [
  // fresh-coat-of-paint links to the inverted 404 page on purpose; there is
  // no /404 route, the not-found page renders for it.
  '/404',
]

function listContentFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.mdx?$/.test(entry.name)) files.push(full)
    }
  }
  walk(CONTENT_DIR)
  return files.sort()
}

function buildIndex(): SiteIndex {
  const { staticRoutes, dynamicRoutes } = collectAppRoutes(APP_DIR)
  return {
    slugs: new Set([
      ...getAllPosts().map((p) => p.slug),
      ...getPages().map((p) => p.slug),
    ]),
    routes: staticRoutes,
    // The root /[slug] route renders posts and pages; the slug set owns it.
    // Other dynamic routes (e.g. /api/md/[slug]) match any segment value.
    dynamicRoutes: dynamicRoutes.filter((r) => r !== '/[slug]'),
    publicFiles: collectPublicFiles(PUBLIC_DIR),
    redirects: getRedirects(),
    allow: new Set(ALLOWED_LINKS),
  }
}

function main() {
  const index = buildIndex()
  const files = listContentFiles()

  let checked = 0
  let broken = 0
  const report: string[] = []

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf-8')
    checked += countInternalLinks(source)
    const problems = checkDocument(source, index)
    if (problems.length === 0) continue
    broken += problems.length
    report.push(path.relative(ROOT, file))
    for (const p of problems) {
      report.push(`  line ${p.line}: ${p.url}`)
      report.push(`    ${p.reason}`)
    }
    report.push('')
  }

  if (broken > 0) {
    console.error(`Link check failed (${broken} broken link(s)):\n`)
    for (const line of report) console.error(line)
    console.error(
      'Fix the link, or add an intentional exception to ALLOWED_LINKS in scripts/check-links.ts with a comment.'
    )
    process.exit(1)
  }
  console.log(
    `Link check passed: ${checked} internal links across ${files.length} files`
  )
}

try {
  main()
} catch (err) {
  console.error('Link check crashed:', err)
  process.exit(1)
}
