/**
 * GitHub-style heading slugs, shared between the web render (heading ids)
 * and anything that computes the same anchors from raw markdown (for
 * example Bell citations). Pure: heading text in, slug out. Lowercase,
 * trim, spaces become hyphens, everything that is not alphanumeric or a
 * hyphen is stripped.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Returns a slug function that deduplicates repeated headings within one
 * document: the second "Notes" becomes notes-2, the third notes-3. Slugs
 * already taken by an earlier heading are skipped, so an explicit "Notes 2"
 * cannot collide with a deduplicated one. Create one slugger per document
 * so counts never leak across posts. Empty heading text returns an empty
 * string and does not advance any count.
 */
export function createSlugger(): (text: string) => string {
  const counts = new Map<string, number>()
  const used = new Set<string>()
  return (text: string) => {
    const base = slugify(text)
    if (!base) return ''
    let count = counts.get(base) ?? 0
    let slug = count === 0 ? base : `${base}-${count + 1}`
    while (used.has(slug)) {
      count += 1
      slug = `${base}-${count + 1}`
    }
    counts.set(base, count + 1)
    used.add(slug)
    return slug
  }
}
