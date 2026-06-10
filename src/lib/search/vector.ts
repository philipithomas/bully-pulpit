/**
 * Pure vector math for hybrid search: brute-force cosine top-k over the
 * committed index vectors, and reciprocal rank fusion to merge a BM25 ranking
 * with a vector ranking. Small corpus (a few thousand chunks), so brute force
 * beats any index structure on simplicity and is plenty fast.
 */

export type Vector = Float32Array | number[]

/** Dot product. Equals cosine similarity when both vectors are normalized. */
export function dot(a: Vector, b: Vector): number {
  const n = Math.min(a.length, b.length)
  let sum = 0
  for (let i = 0; i < n; i++) sum += a[i] * b[i]
  return sum
}

export interface ScoredItem<T> {
  item: T
  score: number
}

/** Top-k items by cosine similarity against a normalized query vector. */
export function topKBySimilarity<T>(
  query: Vector,
  items: T[],
  getVector: (item: T) => Vector,
  k: number
): ScoredItem<T>[] {
  return items
    .map((item) => ({ item, score: dot(query, getVector(item)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/**
 * Reciprocal rank fusion over ranked id lists (best first). Score of id =
 * sum over lists of 1 / (k + rank), rank starting at 1. Equal weights.
 */
export function rrfFuse(
  rankings: string[][],
  k = 60
): { id: string; score: number }[] {
  const scores = new Map<string, number>()
  for (const ranking of rankings) {
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank]
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1))
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}
