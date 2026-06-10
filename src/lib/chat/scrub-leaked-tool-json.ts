/**
 * Some models emit unbound tool-call JSON as visible text when they attempt
 * a call that cannot run. Observed live with gpt-oss-120b: fragments like
 * {"query":"…"}{"slug":"…"} streamed ahead of the prose answer. The model has
 * since been replaced, but this scrub keeps any provider regression from ever
 * rendering raw call JSON to a visitor. Only a leading run of fragments is
 * stripped; JSON quoted later in prose is left alone.
 */
const LEAKED_CALLS = /^(?:\s*\{"(?:query|slug)":"[^"{}]*"\})+\s*/

export function scrubLeakedToolJson(text: string): string {
  return text.replace(LEAKED_CALLS, '')
}
