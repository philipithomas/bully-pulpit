import fs from 'node:fs'
import path from 'node:path'

/**
 * Internal link extraction and validation for MDX content. Pure logic lives
 * here so it can be unit tested; `scripts/check-links.ts` wires it to the
 * real content directory, app routes, and public files.
 *
 * Scope: internal references only (`/slug`, `/images/...`). External URLs are
 * intentionally out of scope so PR CI stays offline and deterministic.
 */

export type LinkRef = {
  url: string
  line: number
}

export type LinkKind = 'internal' | 'external' | 'fragment' | 'relative'

export type Redirect = {
  source: string
  destination: string
}

export type SiteIndex = {
  /** Published post + page slugs, served at /:slug */
  slugs: Set<string>
  /** Static app routes: '/', '/contraption', '/feed/rss.xml', ... */
  routes: Set<string>
  /** Dynamic route patterns like '/api/md/[slug]' (root '/[slug]' excluded: the slug set owns it) */
  dynamicRoutes: string[]
  /** Files under public/ as URL paths: '/images/portrait.jpg' */
  publicFiles: Set<string>
  /** next.config redirects: a link to a source resolves to its destination */
  redirects: Redirect[]
  /** Intentional exceptions, matched against the raw URL and the cleaned pathname */
  allow: Set<string>
}

export type LinkProblem = {
  url: string
  line: number
  reason: string
}

// --- extraction ---------------------------------------------------------

/**
 * Replaces fenced code blocks and inline code spans with spaces (preserving
 * newlines) so link syntax inside code samples is not parsed.
 */
export function maskCode(source: string): string {
  const lines = source.split('\n')
  let inFence = false
  const masked = lines.map((line) => {
    const isFenceDelimiter = /^\s*(```|~~~)/.test(line)
    if (isFenceDelimiter) {
      inFence = !inFence
      return ' '.repeat(line.length)
    }
    if (inFence) return ' '.repeat(line.length)
    // Inline code spans on this line
    return line.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))
  })
  return masked.join('\n')
}

/** Strips YAML frontmatter, preserving line count so line numbers stay true. */
export function maskFrontmatter(source: string): string {
  const match = source.match(/^---\n[\s\S]*?\n---/)
  if (!match) return source
  const blanked = match[0].replace(/[^\n]/g, ' ')
  return blanked + source.slice(match[0].length)
}

const MD_LINK_RE =
  /!?\[[^\]]*\]\(\s*(?:<([^>\n]*)>|((?:[^()\s]|\([^()\n]*\))+))/g
const ATTR_RE = /(?:href|src|poster)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

/**
 * Extracts link/image targets from MDX: markdown `[x](url)` and `![x](url)`,
 * plus JSX/HTML href, src, and poster attributes. Code blocks are ignored.
 */
export function extractLinks(source: string): LinkRef[] {
  const text = maskCode(maskFrontmatter(source))
  const refs: LinkRef[] = []
  const lineOf = (index: number) => text.slice(0, index).split('\n').length

  for (const match of text.matchAll(MD_LINK_RE)) {
    const url = (match[1] ?? match[2] ?? '').trim()
    if (url !== '') refs.push({ url, line: lineOf(match.index) })
  }
  for (const match of text.matchAll(ATTR_RE)) {
    const url = (match[1] ?? match[2] ?? '').trim()
    if (url !== '') refs.push({ url, line: lineOf(match.index) })
  }
  return refs.sort((a, b) => a.line - b.line)
}

// --- classification -----------------------------------------------------

export function classifyLink(url: string): LinkKind {
  if (url.startsWith('#')) return 'fragment'
  if (url.startsWith('//')) return 'external'
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return 'external'
  if (url.startsWith('/')) return 'internal'
  return 'relative'
}

/** Drops the query string and fragment, trims a trailing slash. No decoding. */
export function pathnameOf(url: string): string {
  let p = url.split('#')[0].split('?')[0]
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  return p
}

function decodedForms(pathname: string): string[] {
  try {
    const decoded = decodeURIComponent(pathname)
    return decoded === pathname ? [pathname] : [pathname, decoded]
  } catch {
    // Malformed escape: validate the raw path as-is
    return [pathname]
  }
}

// --- redirects ----------------------------------------------------------

/**
 * Matches a path against a next.config redirect source supporting the two
 * pattern styles this site uses: `:name` (one segment) and `:name*`
 * (zero or more trailing segments). Returns the substituted destination,
 * or null if the source does not match.
 */
export function resolveRedirect(
  redirect: Redirect,
  pathname: string
): string | null {
  const sourceSegs = redirect.source.split('/').filter(Boolean)
  const pathSegs = pathname.split('/').filter(Boolean)
  const params = new Map<string, string>()

  for (let i = 0; i < sourceSegs.length; i++) {
    const seg = sourceSegs[i]
    const catchAll = /^:(\w+)\*$/.exec(seg)
    if (catchAll) {
      if (i !== sourceSegs.length - 1) return null
      params.set(catchAll[1], pathSegs.slice(i).join('/'))
      return substitute(redirect.destination, params)
    }
    const param = /^:(\w+)$/.exec(seg)
    if (param) {
      if (pathSegs[i] === undefined) return null
      params.set(param[1], pathSegs[i])
      continue
    }
    if (pathSegs[i] !== seg) return null
  }
  if (pathSegs.length !== sourceSegs.length) return null
  return substitute(redirect.destination, params)
}

function substitute(destination: string, params: Map<string, string>): string {
  let out = destination
  for (const [name, value] of params) {
    out = out.replace(`:${name}*`, value).replace(`:${name}`, value)
  }
  // A zero-segment catch-all can leave '/printing-press/' style tails
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1)
  return out
}

// --- routes -------------------------------------------------------------

const ROUTE_FILES = [
  'page.tsx',
  'page.ts',
  'page.jsx',
  'page.mdx',
  'route.ts',
  'route.tsx',
  'route.js',
]

/**
 * Enumerates App Router routes by walking an app directory for page/route
 * files. Route groups `(group)` are dropped from the path, `_private` and
 * `@slot` directories are skipped. Routes containing dynamic `[param]`
 * segments are returned separately as patterns.
 */
export function collectAppRoutes(appDir: string): {
  staticRoutes: Set<string>
  dynamicRoutes: string[]
} {
  const staticRoutes = new Set<string>()
  const dynamicRoutes: string[] = []

  const walk = (dir: string, segments: string[]) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    if (entries.some((e) => e.isFile() && ROUTE_FILES.includes(e.name))) {
      const route = `/${segments.join('/')}` || '/'
      if (route.includes('[')) dynamicRoutes.push(route)
      else staticRoutes.add(route === '' ? '/' : route)
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('_') || entry.name.startsWith('@')) continue
      const isGroup = entry.name.startsWith('(') && entry.name.endsWith(')')
      walk(
        path.join(dir, entry.name),
        isGroup ? segments : [...segments, entry.name]
      )
    }
  }
  walk(appDir, [])
  return { staticRoutes, dynamicRoutes }
}

export function matchesDynamicRoute(
  pathname: string,
  patterns: string[]
): boolean {
  return patterns.some((pattern) => {
    const regex = new RegExp(
      `^${pattern
        .split('/')
        .map((seg) => {
          if (/^\[\.\.\..+\]$/.test(seg)) return '.+'
          if (/^\[.+\]$/.test(seg)) return '[^/]+'
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('/')}$`
    )
    return regex.test(pathname)
  })
}

/** Walks public/ and returns every file as a URL path ('/images/foo.jpg'). */
export function collectPublicFiles(publicDir: string): Set<string> {
  const files = new Set<string>()
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      const urlPath = `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(full, urlPath)
      else files.add(urlPath)
    }
  }
  walk(publicDir, '')
  return files
}

// --- validation ---------------------------------------------------------

function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return Number.POSITIVE_INFINITY
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = curr
  }
  return prev[b.length]
}

function suggest(pathname: string, index: SiteIndex): string | null {
  const target = pathname.replace(/^\//, '')
  let best: { slug: string; distance: number } | null = null
  for (const slug of [...index.slugs, ...index.routes]) {
    const candidate = slug.replace(/^\//, '')
    const distance = levenshtein(target, candidate)
    if (distance <= 2 && (best === null || distance < best.distance)) {
      best = { slug: candidate, distance }
    }
  }
  return best ? `/${best.slug}` : null
}

/**
 * Validates one internal pathname against the site index. Returns null when
 * the link resolves, or a human-readable reason when it does not.
 */
export function checkInternalPath(
  pathname: string,
  index: SiteIndex,
  depth = 0
): string | null {
  if (depth > 5) return 'redirect loop'
  // Files under public/ keep their literal names: a %20 in a URL may match
  // a decoded filename on disk, or a filename that contains a literal %20.
  for (const p of decodedForms(pathname)) {
    if (index.allow.has(p)) return null
    if (index.routes.has(p)) return null
    if (index.publicFiles.has(p)) return null
    if (matchesDynamicRoute(p, index.dynamicRoutes)) return null
  }

  const decoded = decodedForms(pathname).at(-1) as string
  const segments = decoded.split('/').filter(Boolean)
  if (segments.length === 1) {
    // /:slug pages and posts, plus the /:slug.md rewrite to /api/md/:slug
    const slug = segments[0].replace(/\.md$/, '')
    if (index.slugs.has(slug)) return null
  }

  for (const redirect of index.redirects) {
    const destination = resolveRedirect(redirect, decoded)
    if (destination !== null && destination !== decoded) {
      const result = checkInternalPath(destination, index, depth + 1)
      return result === null
        ? null
        : `redirects to ${destination}, which is broken (${result})`
    }
  }

  const suggestion = suggest(decoded, index)
  return `no matching post, page, route, or public file${
    suggestion ? ` (did you mean ${suggestion}?)` : ''
  }`
}

/** Extracts and validates every internal reference in one MDX document. */
export function checkDocument(source: string, index: SiteIndex): LinkProblem[] {
  const problems: LinkProblem[] = []
  for (const ref of extractLinks(source)) {
    if (index.allow.has(ref.url)) continue
    const kind = classifyLink(ref.url)
    if (kind === 'external' || kind === 'fragment') continue
    if (kind === 'relative') {
      if (!index.allow.has(pathnameOf(ref.url))) {
        problems.push({
          url: ref.url,
          line: ref.line,
          reason: 'relative link: internal links need a leading slash',
        })
      }
      continue
    }
    const reason = checkInternalPath(pathnameOf(ref.url), index)
    if (reason !== null) {
      problems.push({ url: ref.url, line: ref.line, reason })
    }
  }
  return problems
}

/** Counts the internal references in one MDX document (for reporting). */
export function countInternalLinks(source: string): number {
  return extractLinks(source).filter((r) => classifyLink(r.url) === 'internal')
    .length
}
