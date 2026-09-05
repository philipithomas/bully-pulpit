export const BELL_EVAL_BASELINE_MODEL_ID = 'openai/gpt-5.4-mini'

export interface BellEvalCliOptions {
  models: string[]
  modelSelection: 'production-vs-baseline' | 'explicit'
  output: string | null
  caseIds: Set<string>
  help: boolean
}

export function bellEvalUsage(): string {
  return [
    'Usage: pnpm bell:eval:live [options]',
    '',
    'Options:',
    '  --models <ids>  Replace the production/baseline pair with comma-separated Gateway model IDs',
    '  --case <id>      Run one case. Repeat to run several cases',
    '  --output <path>  Write the Markdown report to a file',
    '  -h, --help       Show this help',
  ].join('\n')
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function uniqueModels(models: string[]): string[] {
  return Array.from(new Set(models))
}

export function parseBellEvalArgs(
  argv: string[],
  productionModel: string
): BellEvalCliOptions {
  const options: BellEvalCliOptions = {
    models: uniqueModels([productionModel, BELL_EVAL_BASELINE_MODEL_ID]),
    modelSelection: 'production-vs-baseline',
    output: null,
    caseIds: new Set(),
    help: false,
  }

  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '-h' || argument === '--help') {
      options.help = true
      continue
    }
    if (argument === '--models') {
      options.models = uniqueModels(
        requireValue(argv, index, argument)
          .split(',')
          .map((model) => model.trim())
          .filter(Boolean)
      )
      options.modelSelection = 'explicit'
      index++
      continue
    }
    if (argument === '--case') {
      options.caseIds.add(requireValue(argv, index, argument))
      index++
      continue
    }
    if (argument === '--output') {
      options.output = requireValue(argv, index, argument)
      index++
      continue
    }
    throw new Error(`Unknown option: ${argument}`)
  }

  if (options.models.length === 0) {
    throw new Error('At least one model is required')
  }
  return options
}
