import { describe, expect, it } from 'vitest'
import {
  resolveRelativeUrls,
  styleContentImages,
  styleContentLinks,
} from '@/lib/email/content-transforms'

// Ported from printing-press templates/mod.rs tests. Base URL is the canonical
// www siteConfig.url, matching the absolute links the body renderer already emits.
const BASE = 'https://www.philipithomas.com'

describe('resolveRelativeUrls', () => {
  it('rewrites href with double quotes', () => {
    expect(resolveRelativeUrls('<a href="/blog/my-post">link</a>')).toBe(
      `<a href="${BASE}/blog/my-post">link</a>`
    )
  })

  it('rewrites href with single quotes', () => {
    expect(resolveRelativeUrls("<a href='/about'>about</a>")).toBe(
      `<a href='${BASE}/about'>about</a>`
    )
  })

  it('rewrites src attributes', () => {
    expect(resolveRelativeUrls('<img src="/images/photo.jpg">')).toBe(
      `<img src="${BASE}/images/photo.jpg">`
    )
  })

  it('leaves absolute urls unchanged', () => {
    const html = '<a href="https://example.com/page">link</a>'
    expect(resolveRelativeUrls(html)).toBe(html)
  })

  it('leaves protocol-relative urls unchanged', () => {
    const html = '<a href="//cdn.example.com/file.js">link</a>'
    expect(resolveRelativeUrls(html)).toBe(html)
  })

  it('leaves mailto links unchanged', () => {
    const html = '<a href="mailto:test@example.com">email</a>'
    expect(resolveRelativeUrls(html)).toBe(html)
  })

  it('leaves anchor links unchanged', () => {
    const html = '<a href="#section">jump</a>'
    expect(resolveRelativeUrls(html)).toBe(html)
  })

  it('rewrites multiple urls in same content', () => {
    const html =
      '<a href="/blog/one">one</a> and <a href="/blog/two">two</a> and <img src="/img/photo.png">'
    expect(resolveRelativeUrls(html)).toBe(
      `<a href="${BASE}/blog/one">one</a> and <a href="${BASE}/blog/two">two</a> and <img src="${BASE}/img/photo.png">`
    )
  })

  it('handles root path', () => {
    expect(resolveRelativeUrls('<a href="/">home</a>')).toBe(
      `<a href="${BASE}/">home</a>`
    )
  })

  it('does not double-rewrite already absolute', () => {
    const html = `<a href="${BASE}/blog/post">link</a>`
    expect(resolveRelativeUrls(html)).toBe(html)
  })

  it('handles mixed absolute and relative', () => {
    const html =
      '<a href="/local">local</a> <a href="https://external.com">ext</a> <img src="/img.png">'
    expect(resolveRelativeUrls(html)).toBe(
      `<a href="${BASE}/local">local</a> <a href="https://external.com">ext</a> <img src="${BASE}/img.png">`
    )
  })
})

describe('styleContentLinks', () => {
  it('styles links with contraption accent', () => {
    expect(
      styleContentLinks('<a href="https://example.com">link</a>', 'contraption')
    ).toBe(
      '<a style="color: #3B3834; text-decoration: underline; text-decoration-color: #2b4a3e; text-underline-offset: 2px;" href="https://example.com">link</a>'
    )
  })

  it('styles links with workshop accent', () => {
    expect(
      styleContentLinks('<a href="https://example.com">link</a>', 'workshop')
    ).toBe(
      '<a style="color: #3B3834; text-decoration: underline; text-decoration-color: #6b4d3a; text-underline-offset: 2px;" href="https://example.com">link</a>'
    )
  })

  it('styles links with postcard accent', () => {
    expect(
      styleContentLinks('<a href="https://example.com">link</a>', 'postcard')
    ).toBe(
      '<a style="color: #3B3834; text-decoration: underline; text-decoration-color: #2c3e6b; text-underline-offset: 2px;" href="https://example.com">link</a>'
    )
  })

  it('styles links with default accent', () => {
    expect(styleContentLinks('<a href="https://example.com">link</a>')).toBe(
      '<a style="color: #3B3834; text-decoration: underline; text-decoration-color: #3B3834; text-underline-offset: 2px;" href="https://example.com">link</a>'
    )
  })

  it('skips links with existing style', () => {
    const html = '<a style="color: red;" href="https://example.com">link</a>'
    expect(styleContentLinks(html, 'contraption')).toBe(html)
  })

  it('styles multiple links', () => {
    const html =
      '<a href="https://one.com">one</a> and <a href="https://two.com">two</a>'
    expect(styleContentLinks(html, 'workshop')).toBe(
      '<a style="color: #3B3834; text-decoration: underline; text-decoration-color: #6b4d3a; text-underline-offset: 2px;" href="https://one.com">one</a> and <a style="color: #3B3834; text-decoration: underline; text-decoration-color: #6b4d3a; text-underline-offset: 2px;" href="https://two.com">two</a>'
    )
  })
})

describe('styleContentImages', () => {
  it('styles img without style', () => {
    expect(
      styleContentImages(
        '<img src="https://example.com/photo.jpg" alt="photo">'
      )
    ).toBe(
      '<img style="max-width: 100%; height: auto; display: block;" src="https://example.com/photo.jpg" alt="photo">'
    )
  })

  it('skips img with existing style', () => {
    const html =
      '<img style="width: 100px;" src="https://example.com/photo.jpg">'
    expect(styleContentImages(html)).toBe(html)
  })

  it('styles multiple images', () => {
    expect(styleContentImages('<img src="a.jpg"> and <img src="b.jpg">')).toBe(
      '<img style="max-width: 100%; height: auto; display: block;" src="a.jpg"> and <img style="max-width: 100%; height: auto; display: block;" src="b.jpg">'
    )
  })

  it('styles images mixed with already-styled', () => {
    expect(
      styleContentImages(
        '<img src="a.jpg"> and <img style="width: 50px;" src="b.jpg">'
      )
    ).toBe(
      '<img style="max-width: 100%; height: auto; display: block;" src="a.jpg"> and <img style="width: 50px;" src="b.jpg">'
    )
  })
})
