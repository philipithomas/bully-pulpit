import { describe, expect, it } from 'vitest'
import { neutralizeFormula, parseCsv, toCsv } from '@/lib/csv'

describe('toCsv', () => {
  it('writes headers + rows terminated with CRLF', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['1', '2'],
          ['3', '4'],
        ]
      )
    ).toBe('a,b\r\n1,2\r\n3,4\r\n')
  })

  it('quotes fields containing commas, quotes, or newlines', () => {
    expect(toCsv(['name'], [['Doe, John'], ['a"b'], ['line\nbreak']])).toBe(
      'name\r\n"Doe, John"\r\n"a""b"\r\n"line\nbreak"\r\n'
    )
  })

  it('stringifies booleans and renders null as empty', () => {
    expect(toCsv(['x', 'y'], [[true, null]])).toBe('x,y\r\ntrue,\r\n')
  })
})

describe('parseCsv', () => {
  it('round-trips toCsv output', () => {
    const csv = toCsv(
      ['email', 'name', 'postcard'],
      [['a@b.com', 'Doe, John', true]]
    )
    expect(parseCsv(csv)).toEqual([
      ['email', 'name', 'postcard'],
      ['a@b.com', 'Doe, John', 'true'],
    ])
  })

  it('handles escaped quotes and quoted commas', () => {
    expect(parseCsv('a,b\r\n"x,y","he said ""hi"""')).toEqual([
      ['a', 'b'],
      ['x,y', 'he said "hi"'],
    ])
  })

  it('handles LF endings, a BOM, and a trailing newline', () => {
    expect(parseCsv('﻿a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('preserves newlines inside quoted fields', () => {
    expect(parseCsv('a\r\n"line\nbreak"')).toEqual([['a'], ['line\nbreak']])
  })

  it('treats bare CR as a row terminator (classic Mac line endings)', () => {
    expect(parseCsv('a,b\r1,2\r')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('neutralizeFormula', () => {
  it('prefixes a quote on formula-leading values', () => {
    expect(neutralizeFormula('=HYPERLINK("http://evil.test")')).toBe(
      `'=HYPERLINK("http://evil.test")`
    )
    expect(neutralizeFormula('+1234')).toBe(`'+1234`)
    expect(neutralizeFormula('-5')).toBe(`'-5`)
    expect(neutralizeFormula('@cmd')).toBe(`'@cmd`)
  })

  it('leaves ordinary values untouched', () => {
    expect(neutralizeFormula('jane@example.com')).toBe('jane@example.com')
    expect(neutralizeFormula('Doe, John')).toBe('Doe, John')
    expect(neutralizeFormula('')).toBe('')
  })
})
