function roundDown(n: number, roundTo: number): number {
  return Math.floor(n / roundTo) * roundTo
}

export function formatMemberCount(count: number): string {
  if (count <= 50) return count.toLocaleString()
  if (count <= 100) return `${roundDown(count, 10).toLocaleString()}+`
  if (count <= 1_000) return `${roundDown(count, 50).toLocaleString()}+`
  if (count <= 10_000) return `${roundDown(count, 100).toLocaleString()}+`
  if (count <= 100_000) return `${roundDown(count, 1_000).toLocaleString()}+`
  if (count <= 1_000_000) {
    const rounded = roundDown(count, 10_000)
    return `${(rounded / 1_000).toLocaleString()}k+`
  }
  const rounded = roundDown(count, 100_000)
  return `${(rounded / 1_000_000).toLocaleString()}m+`
}
