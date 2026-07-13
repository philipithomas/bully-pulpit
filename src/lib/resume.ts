export type ResumeMediaKind =
  | 'Article'
  | 'Case study'
  | 'Podcast'
  | 'Product'
  | 'Video'

export interface ResumeMedia {
  title: string
  url: string
  kind: ResumeMediaKind
  source: string
}

export interface ResumeEntry {
  company: string
  companyUrl: string
  role: string
  start: string
  end: string
  location: string
  logoSrc: string
  highlights: readonly string[]
  media?: readonly ResumeMedia[]
}

export const resumeExperience = [
  {
    company: 'Chroma',
    companyUrl: 'https://www.trychroma.com/',
    role: 'Lead engineer, control plane',
    start: '2025-01',
    end: '2026-06',
    location: 'San Francisco, CA, USA',
    logoSrc: '/images/resume/chroma.png',
    highlights: [
      'Designed and built S3 Sync solo, an event-driven customer-data ingestion platform spanning Terraform and SQS infrastructure, a Rust pipeline, and a Next.js and TypeScript interface. It sustained 20,000 inserts per minute and landed a $100,000-per-month hedge-fund customer.',
      "Rewrote Chroma's multi-model embedding control plane on Modal's Flash architecture, replacing queue-based routing with dynamic autoscaling and cutting p50 latency by a factor of 13 and p99 latency by a factor of 50. The platform sustained 600 queries per second and powered about half of company revenue.",
      "Identified and reported a concurrency bug in Modal's FastAPI bindings where request state leaked across concurrent requests at await points, inflating billed input counts.",
      'Shipped the enterprise foundations for the Chroma Cloud launch: SSO and SCIM, entitlements and customer lifecycle states, usage-based billing, and product analytics. Helped close xAI as a marquee customer.',
      'Led a four-engineer team spanning authentication, dashboard, sync, billing, embeddings, and integrations. Set technical direction and review across the control plane, developed the Agent Experience strategy, and implemented the Stripe agentic provisioning protocol.',
    ],
    media: [
      {
        title: 'Chroma Sync: ingest data from GitHub, websites, and S3',
        url: 'https://www.youtube.com/watch?v=Cliqy1W3yic',
        kind: 'Video',
        source: 'Chroma',
      },
      {
        title: 'Chroma and Stripe Projects: a database for agentic workflows',
        url: 'https://www.youtube.com/watch?v=tyaPM7GUsnM',
        kind: 'Video',
        source: 'Stripe Developers',
      },
      {
        title: 'Chroma Cloud on Stripe Projects',
        url: 'https://www.youtube.com/watch?v=mVPXjn4K76k',
        kind: 'Video',
        source: 'Chroma',
      },
      {
        title: 'Five things to know about Chroma Cloud',
        url: 'https://www.youtube.com/watch?v=CCYpwEV7wVY',
        kind: 'Video',
        source: 'Chroma',
      },
    ],
  },
  {
    company: 'Find AI',
    companyUrl: 'https://usefind.ai/',
    role: 'CTO and founding engineer',
    start: '2023-08',
    end: '2024-11',
    location: 'New York, NY, USA',
    logoSrc: '/images/resume/find-ai.png',
    highlights: [
      'Built semantic, multi-criteria search over unstructured professional-profile data in Ruby on Pinecone and Elasticsearch, scaling to 19 million OpenAI requests per week over more than 100 million vectors.',
      'Designed an LLM search-evaluation harness for systematic tuning of retrieval quality, covering query decomposition, parallel candidate generation, LLM-as-judge scoring, regression benchmarks, and evaluations.',
      'Closed Clay as an enterprise customer. Designed the API, built TypeScript SDKs, and implemented usage-based billing.',
      'Raised $8 million from Felicis Ventures, Daniel Gross, and Nat Friedman.',
    ],
    media: [
      {
        title: 'Find AI integration',
        url: 'https://university.clay.com/docs/find-ai-integration-overview',
        kind: 'Product',
        source: 'Clay',
      },
    ],
  },
  {
    company: 'Contraption Co.',
    companyUrl: 'https://www.contraption.co/',
    role: 'Founder',
    start: '2022-08',
    end: '2023-08',
    location: 'New York, NY, USA',
    logoSrc: '/images/contraption-icon.svg',
    highlights: [
      'Shipped two solo AI products with novel LLM use: Postcard, which remains monetized in production with more than 500 GitHub stars, and Booklet.',
      'Consulted for early-stage startups and a government contractor. Built an AI-powered iterative ClickHouse query editor and a custom LLM evaluation application.',
    ],
    media: [
      {
        title: 'Postcard',
        url: 'https://postcard.page/',
        kind: 'Product',
        source: 'Contraption Co.',
      },
      {
        title: 'Booklet',
        url: 'https://booklet.group/',
        kind: 'Product',
        source: 'Contraption Co.',
      },
    ],
  },
  {
    company: 'Webflow',
    companyUrl: 'https://webflow.com/',
    role: 'Lead product manager',
    start: '2021-08',
    end: '2022-08',
    location: 'Remote',
    logoSrc: '/images/resume/webflow.png',
    highlights: [
      "Launched Webflow's first Next.js and TypeScript surface, Made in Webflow, a social gallery for Webflow-built sites. Partnered with design and engineering on the server-rendering and SEO tradeoffs of a logged-in, interactive product and drove 83 percent organic-traffic growth.",
    ],
    media: [
      {
        title: 'Introducing Made in Webflow',
        url: 'https://webflow.com/updates/made-in-webflow-launch',
        kind: 'Product',
        source: 'Webflow',
      },
    ],
  },
  {
    company: 'Trusted Health',
    companyUrl: 'https://www.trustedhealth.com/',
    role: 'Technical product manager',
    start: '2020-11',
    end: '2021-08',
    location: 'Remote',
    logoSrc: '/images/resume/trusted-health.png',
    highlights: [
      'Defined and shipped Works Billing, an enterprise payments platform for high-volume travel-nurse spend covering invoice generation, dispute state machines, supplier payouts, ACH and wire payments, timekeeping integrations, permissions, audit logs, and reconciliation workflows.',
      'Coordinated engineering, operations, finance, legal, hospital, and supplier stakeholders from zero to production. Launched to 13 suppliers and processed $12 million in gross merchandise value in the first month.',
    ],
    media: [
      {
        title:
          'How Mercy saved more than $70 million in labor spend using Works',
        url: 'https://www.trustedhealth.com/case-study/mercy',
        kind: 'Case study',
        source: 'Trusted Health',
      },
    ],
  },
  {
    company: 'Moonlight',
    companyUrl: 'https://www.moonlightwork.com/',
    role: 'CEO and founder',
    start: '2017-03',
    end: '2020-08',
    location: 'Remote',
    logoSrc: '/images/resume/moonlight.png',
    highlights: [
      'Built a developer marketplace spanning microservices, marketplace payments, search, matching, messaging, contracts, and client and developer workflows. Processed more than $10 million in payments through Stripe Connect.',
      'Designed search and matching systems combining tag-based retrieval, structured profile data, and collaborative filtering to match 10,000 developers with clients including Dropbox and Cloudflare.',
    ],
    media: [
      {
        title: 'PullRequest acquires Moonlight',
        url: 'https://techcrunch.com/2020/02/17/pullrequest-snags-remote-developer-hiring-platform-moonlight-in-case-of-startup-buying-startup/',
        kind: 'Article',
        source: 'TechCrunch',
      },
      {
        title: 'Remote work with Philip Thomas',
        url: 'https://softwareengineeringdaily.com/2019/12/10/remote-work-with-philip-thomas/',
        kind: 'Podcast',
        source: 'Software Engineering Daily',
      },
    ],
  },
  {
    company: 'Staffjoy',
    companyUrl: 'https://www.staffjoy.com/',
    role: 'CEO and founder',
    start: '2015-10',
    end: '2017-03',
    location: 'San Francisco, CA, USA',
    logoSrc: '/images/resume/staffjoy.png',
    highlights: [
      'Built a workforce-management platform and optimization engine in Python, Go, React, Kubernetes, gRPC, Bazel, Julia, and Gurobi. Led algorithm development including benchmarking, profiling, tuning, and a regression-evaluation harness for solution quality.',
      'Selected for the inaugural Y Combinator Fellowship and open-sourced the platform, which has earned more than 2,500 GitHub stars.',
    ],
    media: [
      {
        title: 'Staffjoy launches from Y Combinator Fellowship',
        url: 'https://techcrunch.com/2015/10/22/staffjoy-launches-from-yc-fellowship-helping-businesses-automate-their-workforce-scheduling/',
        kind: 'Article',
        source: 'TechCrunch',
      },
      {
        title: 'Staffjoy founders on the Y Combinator Fellowship experience',
        url: 'https://source.washu.edu/2016/02/staffjoy-founders-on-the-y-combinator-fellowship-experience/',
        kind: 'Article',
        source: 'Washington University',
      },
    ],
  },
  {
    company: 'OpenDNS, acquired by Cisco',
    companyUrl: 'https://www.opendns.com/',
    role: 'Senior software engineer',
    start: '2013-05',
    end: '2015-10',
    location: 'San Francisco, CA, USA',
    logoSrc: '/images/resume/opendns.png',
    highlights: [
      "Introduced Go at OpenDNS and built telemetry and visualization systems for more than 300,000 on-premise clients. Piloted Docker as the first application on the company's pre-Kubernetes internal hosting platform.",
    ],
    media: [
      {
        title: 'Cisco to acquire OpenDNS for $635 million',
        url: 'https://techcrunch.com/2015/06/30/cisco-to-buy-cloud-security-company-opendns-for-635m-in-cash/',
        kind: 'Article',
        source: 'TechCrunch',
      },
    ],
  },
] as const satisfies readonly ResumeEntry[]

export const resumeEducation = {
  company: 'Washington University in St. Louis McKelvey School of Engineering',
  companyUrl: 'https://engineering.washu.edu/',
  role: 'Bachelor of Science',
  start: '2009',
  end: '2013',
  location: 'St. Louis, MO, USA',
  logoSrc: '/images/resume/washu.png',
  highlights: [
    'Majors in Systems Engineering and Physics. Minor in Electrical Engineering.',
  ],
  media: [
    {
      title: 'Washington University students win $25,000 for medical device',
      url: 'https://www.bizjournals.com/stlouis/blog/BizNext/2013/05/washington-university-students-win.html',
      kind: 'Article',
      source: 'St. Louis Business Journal',
    },
  ],
} as const satisfies ResumeEntry

export const resumeSecurityCredit = {
  title: 'Two responsible security disclosures acknowledged by Y Combinator',
  dates: '2018-09-17 and 2018-10-23',
  url: 'https://www.ycombinator.com/security/',
} as const

function mediaText(media: readonly ResumeMedia[] | undefined): string[] {
  if (!media?.length) return []
  return [
    'Selected work:',
    ...media.map((item) => `- ${item.title} (${item.kind}, ${item.source})`),
  ]
}

function entryText(entry: ResumeEntry): string {
  return [
    `${entry.role} at ${entry.company}`,
    `${entry.start} to ${entry.end} | ${entry.location}`,
    ...entry.highlights.map((highlight) => `- ${highlight}`),
    ...mediaText(entry.media),
  ].join('\n')
}

export const resumePublicText = [
  'Philip I. Thomas',
  'Résumé',
  'Experience',
  ...resumeExperience.map(entryText),
  'Education',
  entryText(resumeEducation),
  `${resumeSecurityCredit.title} (${resumeSecurityCredit.dates})`,
].join('\n\n')
