import { describe, expect, it } from 'vitest'
import {
  getPageContextContent,
  getSelectedPassageContext,
  PAGE_CONTENT_MAX_CHARS,
  toPagePlaintext,
  toPlaintext,
} from '@/lib/chat/page-context'
import { collectionEntryAnchor, getCollection } from '@/lib/collections'
import { siteConfig } from '@/lib/config'
import { getAllPosts, getPageBySlug } from '@/lib/content/loader'

describe('getPageContextContent', () => {
  it('resolves a known post path to its title and content', () => {
    const post = getAllPosts()[0]
    const result = getPageContextContent(`/${post.slug}`)
    expect(result).not.toBeNull()
    expect(result?.slug).toBe(post.slug)
    expect(result?.title).toBe(post.frontmatter.title)
    expect(result?.source).toEqual({
      type: 'post',
      title: post.frontmatter.title,
      url: `/${post.slug}`,
      publishedAt: post.frontmatter.publishedAt,
      newsletter: post.newsletter,
    })
    expect(result?.content.length).toBeGreaterThan(0)
    expect(result?.content.length).toBeLessThanOrEqual(PAGE_CONTENT_MAX_CHARS)
  })

  it('resolves a known content page path', () => {
    const page = getPageBySlug('colophon')
    expect(page).not.toBeNull()
    const result = getPageContextContent('/colophon')
    expect(result).not.toBeNull()
    expect(result?.title).toBe(page?.frontmatter.title)
    expect(result?.source).toEqual({
      type: 'page',
      title: page?.frontmatter.title,
      url: '/colophon',
      publishedAt: page?.frontmatter.publishedAt ?? null,
      newsletter: 'page',
    })
  })

  it('includes a photo-only post description and location before camera details', () => {
    const result = getPageContextContent('/cooking-class')
    expect(result?.content).toMatch(
      /^Cover image description: Mette Søberg demonstrating how to use liquid nitrogen with parsley\.\n\nLocation: Noma test kitchen\n\nPhoto metadata: /
    )
    expect(result?.content).not.toContain('/images/')
    expect(result?.content).not.toContain('maps.app.goo.gl')
    expect(result?.truncated).toBe(false)
  })

  it('injects the public Stargazing ledger into current-page context', () => {
    const result = getPageContextContent('/stargazing')
    expect(result?.content).toContain('Silo | London')
    expect(result?.content).toContain('Osteria Francescana')
    expect(result?.truncated).toBe(false)
  })

  it('uses the active phone number in contact page context', () => {
    const previous = process.env.PHONE_NUMBER
    process.env.PHONE_NUMBER = '+442079460000'
    try {
      const result = getPageContextContent('/contact')
      expect(result?.content).toContain('Telephone: +442079460000')
      expect(result?.content).not.toContain('+1 212 347 3190')
    } finally {
      if (previous === undefined) delete process.env.PHONE_NUMBER
      else process.env.PHONE_NUMBER = previous
    }
  })

  it('handles a trailing slash', () => {
    const post = getAllPosts()[0]
    expect(getPageContextContent(`/${post.slug}/`)?.slug).toBe(post.slug)
  })

  it('resolves registered app pages through the shared Bell text', () => {
    const home = getPageContextContent('/')
    expect(home).toMatchObject({
      slug: 'app-home',
      title: 'Home',
      fetchPath: '/',
      truncated: false,
      source: {
        type: 'page',
        title: 'Home',
        url: '/',
        publishedAt: null,
        newsletter: 'page',
      },
    })
    expect(home?.content).toContain(siteConfig.author)

    const print = getPageContextContent('/print')
    expect(print?.content).toContain('no longer available to order')

    const workshop = getPageContextContent('/workshop')
    expect(workshop?.source.newsletter).toBe('workshop')
  })

  it('returns null for unknown paths', () => {
    expect(getPageContextContent('/no-such-post-exists-here')).toBeNull()
  })

  it('returns null for nested paths', () => {
    expect(getPageContextContent('/feed/contraption')).toBeNull()
  })

  it('returns null for non-string input', () => {
    expect(getPageContextContent(undefined)).toBeNull()
    expect(getPageContextContent(42)).toBeNull()
    expect(getPageContextContent({ path: '/colophon' })).toBeNull()
  })

  it('truncates long content and sets the truncated flag', () => {
    const post = getAllPosts().find(
      (candidate) => toPlaintext(candidate.content).length > 100
    )
    if (!post) throw new Error('Expected at least one long post')
    const result = getPageContextContent(`/${post.slug}`, 100)
    expect(result?.truncated).toBe(true)
    expect(result?.content.length).toBe(100)
  })

  it('strips markdown image and link syntax from the content', () => {
    for (const post of getAllPosts().slice(0, 10)) {
      const result = getPageContextContent(`/${post.slug}`)
      expect(result?.content).not.toContain('![')
      expect(result?.content).not.toMatch(/\]\(/)
    }
  })
})

describe('getSelectedPassageContext', () => {
  const quote =
    'The site is a Next.js application with MDX content, statically generated at build time'

  it('resolves the page, quote, and heading against canonical content', () => {
    const pageContent = getPageContextContent('/colophon')
    expect(
      getSelectedPassageContext(
        {
          action: 'context',
          text: ` ${quote}\n`,
          path: '/colophon',
          headingId: 'technical',
        },
        '/colophon',
        pageContent
      )
    ).toEqual({
      action: 'context',
      text: quote,
      path: '/colophon',
      headingId: 'technical',
      headingText: 'Technical',
      source: {
        type: 'page',
        title: 'Colophon',
        url: '/colophon#technical',
        publishedAt: null,
        newsletter: 'page',
        section: 'Technical',
      },
    })
  })

  it('rejects spoofed paths, noncanonical quotes, and utility pages', () => {
    const validRequest = {
      action: 'explain',
      text: quote,
      path: '/colophon',
      headingId: 'technical',
    }
    expect(
      getSelectedPassageContext(
        { ...validRequest, path: '/privacy' },
        '/colophon',
        getPageContextContent('/colophon')
      )
    ).toBeNull()
    expect(
      getSelectedPassageContext(
        { ...validRequest, text: 'This fabricated quotation is long enough.' },
        '/colophon',
        getPageContextContent('/colophon')
      )
    ).toBeNull()
    expect(
      getSelectedPassageContext(
        {
          action: 'explain',
          text: 'This Privacy Policy describes how your personal information',
          path: '/privacy',
        },
        '/privacy',
        getPageContextContent('/privacy')
      )
    ).toBeNull()
  })

  it('drops a spoofed heading while retaining valid page provenance', () => {
    const context = getSelectedPassageContext(
      {
        action: 'explain',
        text: quote,
        path: '/colophon',
        headingId: 'not-a-real-heading',
      },
      '/colophon',
      getPageContextContent('/colophon')
    )
    expect(context?.headingId).toBeUndefined()
    expect(context?.source.url).toBe('/colophon')
    expect(context?.source.section).toBeUndefined()
  })

  it('drops a real but incorrect heading for the canonical quote', () => {
    const context = getSelectedPassageContext(
      {
        action: 'explain',
        text: quote,
        path: '/colophon',
        headingId: 'typographical',
      },
      '/colophon',
      getPageContextContent('/colophon')
    )
    expect(context?.headingId).toBeUndefined()
    expect(context?.source.url).toBe('/colophon')
  })

  it('matches escaped Markdown punctuation to rendered passage text', () => {
    const path = '/how-to-host-web-apps-on-a-mac-mini'
    const escapedQuote = '*(When I build this, the scripts will be in Github!)'
    expect(
      getSelectedPassageContext(
        {
          action: 'context',
          text: escapedQuote,
          path,
          headingId: 'disaster-recovery',
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({
      text: escapedQuote,
      headingId: 'disaster-recovery',
      headingText: 'Disaster recovery',
      source: {
        url: `${path}#disaster-recovery`,
        section: 'Disaster recovery',
      },
    })
  })

  it('matches rendered text selected across Markdown list items', () => {
    const path = '/digital-quiet'
    const listQuote =
      'Elevate the threshold for initiating conversations, discouraging trivial interruptions. Promote well-considered, clear communication to reduce the need for follow-up clarifications.'
    expect(
      getSelectedPassageContext(
        {
          action: 'explain',
          text: listQuote,
          path,
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({ text: listQuote, path })
  })

  it('matches rendered text selected across a Markdown thematic break', () => {
    const path = '/software-in-the-ai-era'
    const text =
      'The impetus was a desire to add some new features to the site, and led to a reflection on how AI is changing the software industry. A few years ago, I spent the day in the test kitchen and fermentation lab at'

    expect(
      getSelectedPassageContext(
        { action: 'context', text, path },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({
      action: 'context',
      text,
      path,
      source: {
        type: 'post',
        title: 'Software in the AI era',
        url: path,
      },
    })
  })

  it('validates visible prose across an image while rejecting its hidden alt text', () => {
    const path = '/chroma'
    const pageContent = getPageContextContent(path)
    const text =
      'And, the original implementation of AI and vector search on Booklet utilized one database. Traditional SQL databases are efficient at filtering.'
    const alt =
      'Naive implementation of vector search for Booklet involves putting all searchable content in the same table.'

    expect(pageContent?.content).toContain(`Image description: ${alt}`)
    expect(
      getSelectedPassageContext(
        { action: 'context', text, path },
        path,
        pageContent
      )
    ).toMatchObject({ text, path })
    expect(
      getSelectedPassageContext(
        { action: 'context', text: alt, path },
        path,
        pageContent
      )
    ).toBeNull()
  })

  it.each([
    'Mette Søberg demonstrating how to use liquid nitrogen with parsley.',
    'Location: Noma test kitchen',
  ])('rejects hidden cover descriptions and synthetic labels: %s', (text) => {
    const path = '/cooking-class'
    expect(
      getSelectedPassageContext(
        { action: 'context', text, path },
        path,
        getPageContextContent(path)
      )
    ).toBeNull()
  })

  it('matches rendered text selected across Markdown blockquote lines', () => {
    const path = '/the-next-iteration-of-contraption-company'
    const blockquote =
      'In most cases the recipe for doing great work is simply: work hard on excitingly ambitious projects, and something good will come of it. - Paul Graham in "How to Do Great Work"'
    expect(
      getSelectedPassageContext(
        {
          action: 'context',
          text: blockquote,
          path,
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({ text: blockquote, path })
  })

  it('preserves a rendered heading nested inside a real blockquote', () => {
    const path = '/chat-with-my-dog'
    const text =
      'Use OpenAI o3 model, pass the image in and ask OpenAI to generate a caption'
    expect(
      getSelectedPassageContext(
        {
          action: 'context',
          text,
          path,
          headingId: 'data-ingestion',
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({
      text,
      headingId: 'data-ingestion',
      headingText: 'Data ingestion',
      source: {
        url: `${path}#data-ingestion`,
        section: 'Data ingestion',
      },
    })
  })

  it.each([
    {
      path: '/2023-03',
      text: 'One Contraption Co. client went from an idea to >$7m in seed funding within five weeks.',
    },
    {
      path: '/2022-12',
      text: 'Had >15k visitors on the first day and hundreds of signups',
    },
  ])('matches real rendered comparisons in $path', ({ path, text }) => {
    expect(
      getSelectedPassageContext(
        {
          action: 'explain',
          text,
          path,
        },
        path,
        getPageContextContent(path)
      )
    ).toMatchObject({ text, path })
  })

  it('validates a selected collection entry before preserving its anchor', () => {
    const path = '/diction'
    const collection = getCollection('diction')
    const entry = collection.entries.find(
      (candidate) => candidate.term === 'Nut graf'
    )
    if (!entry) throw new Error('Expected the Nut graf entry')
    const entryAnchor = collectionEntryAnchor(entry)
    const request = {
      action: 'context',
      text: entry.definition,
      path,
      headingId: 'letter-n',
      entryAnchor,
    }

    expect(
      getSelectedPassageContext(request, path, getPageContextContent(path))
    ).toMatchObject({
      text: entry.definition,
      entryAnchor,
      source: {
        type: 'page',
        title: 'Diction',
        url: '/diction#nut-graf',
        publishedAt: null,
        newsletter: 'page',
        section: 'Nut graf',
      },
    })

    const mismatchedEntry = getSelectedPassageContext(
      { ...request, entryAnchor: 'lindy-effect' },
      path,
      getPageContextContent(path)
    )
    expect(mismatchedEntry?.entryAnchor).toBeUndefined()
    expect(mismatchedEntry?.source.url).toBe('/diction')
    expect(mismatchedEntry?.source.section).toBeUndefined()
  })
})

describe('toPlaintext', () => {
  it('keeps Markdown image descriptions without image paths or link syntax', () => {
    expect(
      toPlaintext(
        'Before\n\n![A chef with a \\[steel\\] bowl.](/images/cooking-(test).jpg)\n\nAfter'
      )
    ).toBe('Before\n\nImage description: A chef with a [steel] bowl.\n\nAfter')
  })

  it.each([
    '<img src="/images/chef.jpg" alt="A chef in the kitchen." />',
    "<Image src='/images/chef.jpg' alt='A chef in the kitchen.' />",
    '<Image src="/images/chef.jpg" alt={"A chef in the kitchen."} />',
    "<Image src='/images/chef.jpg' alt={ 'A chef in the kitchen.' } />",
  ])('keeps static image alt text from %s', (markup) => {
    expect(toPlaintext(`Before\n\n${markup}\n\nAfter`)).toBe(
      'Before\n\nImage description: A chef in the kitchen.\n\nAfter'
    )
  })

  it('handles quoted angle brackets and escaped quotes inside static JSX alt text', () => {
    expect(
      toPlaintext(
        '<Image src="/images/chart.jpg" alt={"A chart labeled \\"profit > cost\\"."} />'
      )
    ).toBe('Image description: A chart labeled "profit > cost".')
  })

  it('reads only the top-level alt after an unsupported JSX attribute expression', () => {
    expect(
      toPlaintext(
        '<Image title={condition ? " alt=\'Not the description\'" : ""} alt="The actual description" />'
      )
    ).toBe('Image description: The actual description')
  })

  it('does not substitute text inside another attribute for a dynamic alt', () => {
    expect(
      toPlaintext(
        '<Image title={condition ? " alt=\'Not the description\'" : ""} alt={image.alt} />'
      )
    ).toBe('')
  })

  it('skips nested expressions and comparison operators before the authored alt', () => {
    expect(
      toPlaintext(
        '<Image {...{ title: count > 0 ? " alt=\'Wrong\'" : "" }} alt="The actual description" />'
      )
    ).toBe('Image description: The actual description')
  })

  it.each([
    '![](/images/decorative.jpg)',
    '<img src="/images/decorative.jpg" alt="" />',
    '<Image src="/images/decorative.jpg" alt={"  "} />',
    '<Image src="/images/decorative.jpg" />',
    '<Image src="/images/decorative.jpg" alt={image.alt} />',
    '<img data-note=" alt=\'Not the description\'" src="/images/decorative.jpg" />',
  ])('omits decorative, missing, and nonstatic descriptions: %s', (markup) => {
    expect(toPlaintext(`Before\n\n${markup}\n\nAfter`)).toBe('Before\n\nAfter')
  })

  it('preserves thematic breaks outside selection comparison', () => {
    expect(toPlaintext('Before\n\n---\n\nAfter')).toBe('Before\n\n---\n\nAfter')
  })

  it('unwraps escaped footnote links', () => {
    expect(toPlaintext('Great[\\[1\\]](#fn1)!')).toBe('Great[1]!')
  })

  it('preserves escaped Markdown punctuation as rendered text', () => {
    expect(toPlaintext('A \\*literal star and \\_underscore.')).toBe(
      'A *literal star and _underscore.'
    )
  })

  it('does not let Markdown normalization reconstruct an HTML tag', () => {
    const plaintext = toPlaintext('Visible prose <scr*ipt')
    expect(plaintext.toLocaleLowerCase('en-US')).not.toContain('<script')
    expect(plaintext).toBe('Visible prose script')
  })

  it('preserves standalone greater-than signs in rendered comparisons', () => {
    expect(
      toPlaintext('Funding was \\>$7m and launch traffic was \\>15k.')
    ).toBe('Funding was >$7m and launch traffic was >15k.')
  })
})

describe('toPagePlaintext', () => {
  it('omits empty frontmatter labels', () => {
    expect(
      toPagePlaintext({
        slug: 'plain-post',
        content: 'Only prose.',
        frontmatter: {
          title: 'Plain post',
          coverImageAlt: ' ',
          location: { name: ' ', url: 'https://example.com' },
          draft: false,
          featured: false,
        },
      })
    ).toBe('Only prose.')
  })
})
