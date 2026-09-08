export const TYPEAHEAD_RESULT_LIMIT = 10

interface TypeaheadResultIdentity {
  id?: string
  slug: string
  url: string
}

function resultKey(result: TypeaheadResultIdentity): string {
  return result.id ?? result.url ?? result.slug
}

export function mergeTypeaheadResults<T extends TypeaheadResultIdentity>(
  lexicalResults: T[],
  hybridResults: T[],
  limit = TYPEAHEAD_RESULT_LIMIT
): T[] {
  const combined = lexicalResults.slice(0, limit)
  const seen = new Set(combined.map(resultKey))

  for (const result of hybridResults) {
    if (combined.length >= limit) break
    const key = resultKey(result)
    if (seen.has(key)) continue
    seen.add(key)
    combined.push(result)
  }

  return combined
}
