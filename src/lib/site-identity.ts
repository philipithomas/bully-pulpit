const publicName = 'Philip Ilic Thomas'

/** Public identity shared by browser, server, feed, email, and metadata code. */
export const siteIdentity = {
  name: publicName,
  description: `${publicName} is an engineer living in New York City, working at the intersection of math, software, and business.`,
  productionUrl: 'https://www.philipithomas.com',
  wordmark: {
    src: '/images/name-wordmark.svg',
    width: 972,
    height: 74,
  },
} as const
