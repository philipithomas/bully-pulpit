import { describe, expect, it } from 'vitest'
import {
  BELL_EVAL_REFERENCE_MODEL_ID,
  bellEvalUsage,
  getBellEvalProviderOptions,
  parseBellEvalArgs,
} from '@/lib/chat/evals/live-options'

const PRODUCTION_MODEL = 'openai/gpt-production'

describe('parseBellEvalArgs', () => {
  it('compares the production model with the named reference by default', () => {
    const options = parseBellEvalArgs([], PRODUCTION_MODEL)

    expect(options.models).toEqual([
      PRODUCTION_MODEL,
      BELL_EVAL_REFERENCE_MODEL_ID,
    ])
    expect(options.modelSelection).toBe('production-vs-reference')
    expect(BELL_EVAL_REFERENCE_MODEL_ID).toBe('openai/gpt-5.4-mini-fast')
  })

  it('does not run the same model twice if it becomes the production model', () => {
    expect(parseBellEvalArgs([], BELL_EVAL_REFERENCE_MODEL_ID).models).toEqual([
      BELL_EVAL_REFERENCE_MODEL_ID,
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

it.each([
  'web',
  'sms',
] as const)('requests fast serving for %s evaluations, including explicit model overrides', (surface) => {
  const options = parseBellEvalArgs(
    ['--models', 'openai/gpt-5.6-luna'],
    PRODUCTION_MODEL
  )
  expect(options.models).toEqual(['openai/gpt-5.6-luna'])
  const providerOptions = getBellEvalProviderOptions(surface, 'test-case')
  expect(providerOptions.gateway).toMatchObject({
    speed: 'fast',
    zeroDataRetention: true,
    user: 'bell-eval:test-case',
  })
  expect('allowFallbackFromFast' in providerOptions.gateway).toBe(false)
  expect('models' in providerOptions.gateway).toBe(false)
})

it('documents that an explicit model list replaces the default pair', () => {
  expect(bellEvalUsage()).toContain('Replace the production/reference pair')
  expect(bellEvalUsage()).toContain(
    'generation-time head-to-head, not an immutable longitudinal snapshot'
  )
})
