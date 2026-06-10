/**
 * GitHub-style heading anchors for section citations.
 *
 * Parity contract: the web render gains matching `id` attributes on headings
 * from the table-of-contents work (src/lib/content/slugify.ts on the
 * feat/heading-anchors-toc branch). The algorithm here must stay
 * byte-identical to that copy or section links point at nothing. Once both
 * branches merge, src/lib/content/slugify.ts becomes the canonical copy and
 * this module re-exports it.
 *
 * Algorithm, applied to the plain text content of a heading:
 *   1. trim, lowercase
 *   2. strip every character that is not a unicode letter, number, space,
 *      hyphen, or underscore
 *   3. replace each space with a hyphen (runs of spaces produce runs of
 *      hyphens, matching GitHub)
 *   4. dedupe within a document in order of appearance: the first occurrence
 *      keeps the base slug, the second becomes `base-2`, the third `base-3`
 */

/** Slugifies a single heading's plain text. No dedupe; see createHeadingSlugger. */
export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N} _-]/gu, '')
    .replace(/ /g, '-')
}

/**
 * Returns a stateful slugger for one document. Call it with each heading's
 * text in document order; duplicates get -2, -3, … suffixes. If a suffixed
 * candidate collides with an anchor already produced (a literal "setup-2"
 * heading followed by two "setup" headings), the counter advances until the
 * candidate is free, so anchors are unique within the document.
 */
export function createHeadingSlugger(): (text: string) => string {
  const counts = new Map<string, number>()
  const used = new Set<string>()

  return (text: string) => {
    const base = slugifyHeading(text)
    let n = counts.get(base) ?? 1
    let candidate = n === 1 ? base : `${base}-${n}`
    while (used.has(candidate)) {
      n += 1
      candidate = `${base}-${n}`
    }
    counts.set(base, n + 1)
    used.add(candidate)
    return candidate
  }
}
