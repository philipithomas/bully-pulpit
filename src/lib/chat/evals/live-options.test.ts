import { describe, expect, it } from 'vitest'
import {
  BELL_EVAL_BASELINE_MODEL_ID,
  bellEvalUsage,
  parseBellEvalArgs,
} from '@/lib/chat/evals/live-options'

const PRODUCTION_MODEL = 'openai/gpt-production'

describe('parseBellEvalArgs', () => {
  it('compares the production model with the fixed baseline by default', () => {
    const options = parseBellEvalArgs([], PRODUCTION_MODEL)

    expect(options.models).toEqual([
      PRODUCTION_MODEL,
      BELL_EVAL_BASELINE_MODEL_ID,
    ])
    expect(options.modelSelection).toBe('production-vs-baseline')
  })

  it('does not run the same model twice if it becomes the production model', () => {
    expect(parseBellEvalArgs([], BELL_EVAL_BASELINE_MODEL_ID).models).toEqual([
      BELL_EVAL_BASELINE_MODEL_ID,
    ])
  })

  it('uses a normalized, de-duplicated explicit model list', () => {
    const options = parseBellEvalArgs(
      ['--models', ' openai/one,openai/two,openai/one '],
      PRODUCTION_MODEL
    )

    expect(options.models).toEqual(['openai/one', 'openai/two'])
    expect(options.modelSelection).toBe('explicit')
  })

  it('collects case filters, output, and help', () => {
    const options = parseBellEvalArgs(
      [
        '--case',
        'first',
        '--case',
        'second',
        '--output',
        '/tmp/report.md',
        '--help',
      ],
      PRODUCTION_MODEL
    )

    expect([...options.caseIds]).toEqual(['first', 'second'])
    expect(options.output).toBe('/tmp/report.md')
    expect(options.help).toBe(true)
  })

  it('rejects missing, empty, and unknown arguments', () => {
    expect(() =>
      parseBellEvalArgs(['--models', ','], PRODUCTION_MODEL)
    ).toThrow('At least one model is required')
    expect(() => parseBellEvalArgs(['--case'], PRODUCTION_MODEL)).toThrow(
      '--case requires a value'
    )
    expect(() => parseBellEvalArgs(['--wat'], PRODUCTION_MODEL)).toThrow(
      'Unknown option: --wat'
    )
  })
})

it('documents that an explicit model list replaces the default pair', () => {
  expect(bellEvalUsage()).toContain('Replace the production/baseline pair')
})
