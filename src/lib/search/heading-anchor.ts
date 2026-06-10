/**
 * GitHub-style heading anchors for section citations.
 *
 * The web render gives every heading an `id` from src/lib/content/slugify.ts
 * (the table-of-contents work, now on main). Section citations must point at
 * those exact ids, so this module re-exports the canonical slugger under the
 * names the search corpus imports. One function computes heading ids for both
 * the web render and Bell citations: they can never drift.
 */
export {
  createSlugger as createHeadingSlugger,
  slugify as slugifyHeading,
} from '@/lib/content/slugify'
