/**
 * Post-build social-metadata guard for every indexable, prerendered page.
 *
 * Next.js shallowly merges nested metadata. A child page can therefore have a
 * correct browser title and canonical while silently inheriting the homepage's
 * complete Open Graph and Twitter objects. Scan the actual built HTML so every
 * present and future public page is covered without a route allowlist.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { siteConfig } from '@/lib/config'
import { NEWSLETTERS } from '@/lib/content/types'

const BUILD_HTML_DIR = join(process.cwd(), '.next', 'server', 'app')
const TITLE_SUFFIX = ` | ${siteConfig.title}`

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
  return relative(BUILD_HTML_DIR, file)
    .split('/')
    .some((segment) => segment.startsWith('_'))
}

function isNoindex(html: string): boolean {
  return /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(html)
}

function valuesFor(
  html: string,
  attribute: 'name' | 'property',
  key: string
): string[] {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(
    `<meta[^>]+${attribute}="${escapedKey}"[^>]+content="([^"]*)"[^>]*>`,
    'gi'
  )
  return [...html.matchAll(pattern)].map((match) => match[1])
}

function canonicalValues(html: string): string[] {
  return [
    ...html.matchAll(/<link[^>]+rel="canonical"[^>]*?href="([^"]*)"[^>]*>/gi),
  ].map((match) => match[1])
}

function titleValues(html: string): string[] {
  return [...html.matchAll(/<title>(.*?)<\/title>/gi)].map((match) => match[1])
}

function one(
  errors: string[],
  rel: string,
  label: string,
  values: string[]
): string | null {
  if (values.length !== 1) {
    errors.push(
      `${rel}: ${values.length} ${label} values (expected exactly one)`
    )
    return null
  }
  if (!values[0]) {
    errors.push(`${rel}: ${label} is empty`)
    return null
  }
  return values[0]
}

function optionalOne(
  errors: string[],
  rel: string,
  label: string,
  values: string[]
): string | null {
  if (values.length === 0) return null
  return one(errors, rel, label, values)
}

function expectedSocialTitle(documentTitle: string): string {
  return documentTitle.endsWith(TITLE_SUFFIX)
    ? documentTitle.slice(0, -TITLE_SUFFIX.length)
    : documentTitle
}

function positiveInteger(value: string | null): boolean {
  return value !== null && /^[1-9]\d*$/.test(value)
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

  const errors: string[] = []
  let checked = 0

  for (const file of files) {
    const rel = relative(BUILD_HTML_DIR, file)
    const html = readFileSync(file, 'utf8')

    if (isFrameworkArtifact(file) || isNoindex(html)) continue
    checked += 1

    const title = one(errors, rel, '<title>', titleValues(html))
    const description = one(
      errors,
      rel,
      'meta description',
      valuesFor(html, 'name', 'description')
    )
    const canonical = one(errors, rel, 'canonical', canonicalValues(html))
    const ogTitle = one(
      errors,
      rel,
      'og:title',
      valuesFor(html, 'property', 'og:title')
    )
    const ogDescription = one(
      errors,
      rel,
      'og:description',
      valuesFor(html, 'property', 'og:description')
    )
    const ogUrl = one(
      errors,
      rel,
      'og:url',
      valuesFor(html, 'property', 'og:url')
    )
    const ogSiteName = one(
      errors,
      rel,
      'og:site_name',
      valuesFor(html, 'property', 'og:site_name')
    )
    one(errors, rel, 'og:type', valuesFor(html, 'property', 'og:type'))
    const ogImage = one(
      errors,
      rel,
      'og:image',
      valuesFor(html, 'property', 'og:image')
    )
    const ogImageWidth = optionalOne(
      errors,
      rel,
      'og:image:width',
      valuesFor(html, 'property', 'og:image:width')
    )
    const ogImageHeight = optionalOne(
      errors,
      rel,
      'og:image:height',
      valuesFor(html, 'property', 'og:image:height')
    )
    one(
      errors,
      rel,
      'og:image:alt',
      valuesFor(html, 'property', 'og:image:alt')
    )

    one(errors, rel, 'twitter:card', valuesFor(html, 'name', 'twitter:card'))
    const twitterTitle = one(
      errors,
      rel,
      'twitter:title',
      valuesFor(html, 'name', 'twitter:title')
    )
    const twitterDescription = one(
      errors,
      rel,
      'twitter:description',
      valuesFor(html, 'name', 'twitter:description')
    )
    const twitterImage = one(
      errors,
      rel,
      'twitter:image',
      valuesFor(html, 'name', 'twitter:image')
    )
    const twitterImageWidth = optionalOne(
      errors,
      rel,
      'twitter:image:width',
      valuesFor(html, 'name', 'twitter:image:width')
    )
    const twitterImageHeight = optionalOne(
      errors,
      rel,
      'twitter:image:height',
      valuesFor(html, 'name', 'twitter:image:height')
    )
    one(
      errors,
      rel,
      'twitter:image:alt',
      valuesFor(html, 'name', 'twitter:image:alt')
    )

    if (title && ogTitle && ogTitle !== expectedSocialTitle(title)) {
      errors.push(
        `${rel}: og:title "${ogTitle}" does not match page title "${expectedSocialTitle(title)}"`
      )
    }
    if (twitterTitle && ogTitle && twitterTitle !== ogTitle) {
      errors.push(`${rel}: twitter:title does not match og:title`)
    }
    if (description && ogDescription && ogDescription !== description) {
      errors.push(`${rel}: og:description does not match meta description`)
    }
    if (
      twitterDescription &&
      ogDescription &&
      twitterDescription !== ogDescription
    ) {
      errors.push(`${rel}: twitter:description does not match og:description`)
    }
    if (canonical && ogUrl && ogUrl !== canonical) {
      errors.push(
        `${rel}: og:url "${ogUrl}" does not match canonical "${canonical}"`
      )
    }
    if (ogSiteName && ogSiteName !== siteConfig.title) {
      errors.push(
        `${rel}: og:site_name "${ogSiteName}" is not "${siteConfig.title}"`
      )
    }
    for (const [label, image] of [
      ['og:image', ogImage],
      ['twitter:image', twitterImage],
    ] as const) {
      if (image && !image.startsWith('https://')) {
        errors.push(`${rel}: ${label} "${image}" is not an absolute HTTPS URL`)
      }
    }
    for (const [label, value] of [
      ['og:image:width', ogImageWidth],
      ['og:image:height', ogImageHeight],
      ['twitter:image:width', twitterImageWidth],
      ['twitter:image:height', twitterImageHeight],
    ] as const) {
      if (value !== null && !positiveInteger(value)) {
        errors.push(`${rel}: ${label} must be a positive integer`)
      }
    }
    for (const [label, width, height] of [
      ['og:image', ogImageWidth, ogImageHeight],
      ['twitter:image', twitterImageWidth, twitterImageHeight],
    ] as const) {
      if ((width === null) !== (height === null)) {
        errors.push(
          `${rel}: ${label} dimensions must include both width and height`
        )
      }
    }

    const newsletter = NEWSLETTERS.find(
      (candidate) => rel === `${candidate}.html`
    )
    if (newsletter) {
      const expectedOgImage = `${siteConfig.url}/${newsletter}/opengraph-image`
      const expectedTwitterImage = `${siteConfig.url}/${newsletter}/twitter-image`
      for (const [label, actual, expected] of [
        ['og:image:width', ogImageWidth, '1200'],
        ['og:image:height', ogImageHeight, '630'],
        ['twitter:image:width', twitterImageWidth, '1200'],
        ['twitter:image:height', twitterImageHeight, '630'],
      ] as const) {
        if (actual !== expected) {
          errors.push(
            `${rel}: ${label} must be ${expected} for a newsletter card`
          )
        }
      }
      if (ogImage && !ogImage.startsWith(expectedOgImage)) {
        errors.push(
          `${rel}: og:image must use the generated ${newsletter} card`
        )
      }
      if (twitterImage && !twitterImage.startsWith(expectedTwitterImage)) {
        errors.push(
          `${rel}: twitter:image must use the generated ${newsletter} card`
        )
      }
    }
  }

  if (errors.length > 0) {
    console.error('Metadata check failed:\n')
    for (const error of errors) console.error(`  - ${error}`)
    console.error(
      `\n${errors.length} problem(s) across ${checked} indexable page(s).`
    )
    process.exit(1)
  }

  console.log(
    `Metadata check passed: ${checked} indexable page(s) have complete, page-specific social metadata.`
  )
}

main()
