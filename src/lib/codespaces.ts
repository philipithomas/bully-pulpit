const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

function isHostname(value: string): boolean {
  return (
    value.length <= 253 &&
    value.includes('.') &&
    value.split('.').every((label) => DNS_LABEL.test(label))
  )
}

/** Returns the HTTPS origin GitHub assigns to a forwarded Codespaces port. */
export function codespacePortOrigin(port: number): string | null {
  if (process.env.CODESPACES !== 'true') return null
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null

  const name = process.env.CODESPACE_NAME?.trim().toLowerCase()
  const domain =
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN?.trim().toLowerCase()
  if (!name || !domain) return null

  const hostname = `${name}-${port}.${domain}`
  return isHostname(hostname) ? `https://${hostname}` : null
}
