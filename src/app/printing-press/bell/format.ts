export function bellTimestampLabel(iso: string): string {
  return `${iso.slice(0, 16)}Z`
}

export function bellTokenLabel(value: number): string {
  return value.toLocaleString('en-US')
}

export function bellCostLabel(value: number): string {
  if (value === 0) return '$0.00'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

export function bellLatencyLabel(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`
  return `${(value / 1000).toFixed(1)} s`
}

export function bellPhoneThreadHref(number: string): string {
  return `/printing-press/phone?number=${encodeURIComponent(number)}`
}
