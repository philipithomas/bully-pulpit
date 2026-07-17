import { requireEnv } from '@/lib/env'
import { siteIdentity } from '@/lib/site-identity'

const staticConfig = {
  title: siteIdentity.name,
  description: siteIdentity.description,
  author: siteIdentity.name,
  email: 'mail@philipithomas.com',
  image: '/og-image.png',
  favicon: '/favicon.ico',
  newsletters: {
    postcard: {
      name: 'Postcard',
      tagline: "What I'm up to.",
      slug: 'postcard',
      color: 'indigo',
      logo: {
        src: '/images/postcard.svg',
        height: 14,
        intrinsicWidth: 2794,
        intrinsicHeight: 636.8,
      },
      icon: '/images/postcard-icon.svg',
    },
    contraption: {
      name: 'Contraption',
      tagline: 'Projects and essays.',
      slug: 'contraption',
      color: 'forest',
      logo: {
        src: '/images/contraption.svg',
        height: 13,
        intrinsicWidth: 1948,
        intrinsicHeight: 350,
      },
      icon: '/images/contraption-icon.svg',
    },
    workshop: {
      name: 'Workshop',
      tagline: 'Journal about work in progress.',
      slug: 'workshop',
      color: 'walnut',
      logo: {
        src: '/images/workshop-brand.svg',
        height: 16,
        intrinsicWidth: 494,
        intrinsicHeight: 137,
      },
      icon: '/images/workshop-icon.svg',
    },
    umami: {
      name: 'umami',
      tagline: 'Photo journal of city life.',
      slug: 'umami',
      color: 'umami',
      logo: {
        src: '/images/umami.svg',
        height: 14,
        intrinsicWidth: 1562,
        intrinsicHeight: 369,
      },
      icon: '/images/umami-icon.svg',
    },
    tsundoku: {
      name: 'Tsundoku',
      tagline: 'Pop-up photography newsletter.',
      slug: 'tsundoku',
      color: 'sun',
      logo: {
        src: '/images/tsundoku.svg',
        height: 11,
        intrinsicWidth: 884,
        intrinsicHeight: 135,
      },
      icon: '/images/tsundoku-icon.svg',
    },
  },
} as const

export const siteConfig = {
  ...staticConfig,
  /**
   * Environment-aware base URL: preview deployments link back to themselves
   * (magic links, unsubscribe URLs, canonicals), `next dev` links to
   * localhost, and everything else — production, local builds, tests — gets
   * the real domain. VERCEL_BRANCH_URL is used over VERCEL_URL because it is
   * stable across redeploys of the branch, so emailed links outlive the
   * specific deployment that sent them. The canonical production host is the
   * www subdomain, hardcoded; the apex domain 301-redirects to www at the
   * Vercel domain level.
   */
  get url(): string {
    if (process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_BRANCH_URL) {
      return `https://${process.env.VERCEL_BRANCH_URL}`
    }
    if (process.env.NODE_ENV === 'development') {
      return 'http://localhost:3000'
    }
    return siteIdentity.productionUrl
  },
  /** '[PREVIEW] ' / '[DEVELOPMENT] ' outside production, '' in production. */
  get emailSubjectPrefix(): string {
    const env =
      process.env.VERCEL_ENV ??
      (process.env.NODE_ENV === 'development' ? 'development' : 'production')
    return env === 'production' ? '' : `[${env.toUpperCase()}] `
  },
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
    // SES_FROM_EMAIL supplies the mailbox only. The public display name always
    // comes from the shared identity so environment config cannot make it stale.
    const configured = process.env.SES_FROM_EMAIL ?? 'mail@philipithomas.com'
    const formattedAddress = configured.match(/<([^<>]+)>\s*$/)?.[1]
    const address = (formattedAddress ?? configured).trim()
    return `${staticConfig.author} <${address}>`
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
