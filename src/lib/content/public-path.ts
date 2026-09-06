/**
 * Build a root-relative URL for a repository-backed content slug.
 *
 * Content metadata is stored on disk, so keep every slug inside a single URL
 * path segment before it reaches HTML or XML. Ordinary post slugs are unchanged,
 * while delimiters that could alter the URL or its surrounding markup are
 * percent-encoded.
 */
export function publicContentPath(slug: string): `/${string}` {
  return `/${encodeURIComponent(slug)}`
}
