function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and fill in values.`
    )
  }
  return value
}

const staticConfig = {
  title: 'Philip I. Thomas',
  description:
    'I work on Chroma, building open-source search infrastructure for AI.',
  url: 'https://philipithomas.com',
  author: 'Philip I. Thomas',
  email: 'mail@philipithomas.com',
  image: '/og-image.png',
  favicon: '/favicon.ico',
  newsletters: {
    postcard: {
      name: 'Postcard',
      tagline: "What I'm up to.",
      slug: 'postcard',
      color: 'indigo',
      logo: { src: '/images/postcard.svg', height: 14 },
    },
    contraption: {
      name: 'Contraption',
      tagline: 'Projects and essays.',
      slug: 'contraption',
      color: 'forest',
      logo: { src: '/images/contraption.svg', height: 13 },
    },
    workshop: {
      name: 'Workshop',
      tagline: 'Journal about work in progress.',
      slug: 'workshop',
      color: 'walnut',
      logo: { src: '/images/workshop-brand.svg', height: 16 },
    },
  },
} as const

export const siteConfig = {
  ...staticConfig,
  get jwtSecret() {
    const secret = requireEnv('JWT_SECRET')
    // Sessions are HS256 JWTs that also gate the admin panel, so a weak secret in
    // production would let an attacker forge an admin session. Enforce real entropy
    // there; allow the short dev default locally so `next dev` still runs.
    if (secret.length < 32 && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be at least 32 characters in production')
    }
    return secret
  },
  get googleClientId() {
    return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ''
  },
  get googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET ?? ''
  },
  get sesFromEmail() {
    return (
      process.env.SES_FROM_EMAIL ?? 'Philip I. Thomas <mail@philipithomas.com>'
    )
  },
  get awsRegion() {
    return process.env.AWS_REGION ?? 'us-east-1'
  },
  get adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? 'mail@philipithomas.com')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  },
}
