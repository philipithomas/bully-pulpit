function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local or run \`vercel pull\`.`
    )
  }
  return value
}

const staticConfig = {
  title: 'Philip I. Thomas',
  description:
    'I build at the intersection of math, business, and software. I work on the engineering team at Chroma.',
  url: 'https://philipithomas.com',
  author: 'Philip I. Thomas',
  email: 'mail@philipithomas.com',
  image: '/og-image.png',
  favicon: '/favicon.ico',
  newsletters: {
    contraption: {
      name: 'Contraption',
      tagline: 'Projects and essays.',
      slug: 'contraption',
      color: 'forest',
    },
    workshop: {
      name: 'Workshop',
      tagline: 'Journal about work in progress.',
      slug: 'workshop',
      color: 'walnut',
    },
    postcard: {
      name: 'Postcard',
      tagline: "What I'm up to.",
      slug: 'postcard',
      color: 'indigo',
    },
  },
  printingPressUrl: process.env.PRINTING_PRESS_URL ?? 'http://localhost:8080',
} as const

export const siteConfig = {
  ...staticConfig,
  get m2mApiKey() {
    return requireEnv('M2M_API_KEY')
  },
  get jwtSecret() {
    return requireEnv('JWT_SECRET')
  },
}
