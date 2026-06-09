/**
 * Reads a required environment variable, throwing a helpful error if unset.
 * Call this lazily (inside functions/getters), never at module top-level, so
 * importing a module during `next build` never requires the variable to exist.
 */
export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in values.`
    )
  }
  return value
}
