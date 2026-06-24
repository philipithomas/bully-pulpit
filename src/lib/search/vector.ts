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
 * sum over lists of weight / (k + rank), rank starting at 1. Omitted weights
 * default to 1, preserving equal-weight fusion.
 */
export function rrfFuse(
  rankings: string[][],
  k = 60,
  weights: number[] = []
): { id: string; score: number }[] {
  const scores = new Map<string, number>()
  for (let i = 0; i < rankings.length; i++) {
    const ranking = rankings[i]
    const weight = weights[i] ?? 1
    for (let rank = 0; rank < ranking.length; rank++) {
      const id = ranking[rank]
      scores.set(id, (scores.get(id) ?? 0) + weight / (k + rank + 1))
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score)
}
