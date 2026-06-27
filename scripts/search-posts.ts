import { hybridSearchPosts } from '@/lib/search/hybrid'

interface CliOptions {
  query: string
  limit: number
  json: boolean
  hybrid: boolean
}

function usage(): string {
  return [
    'Usage: pnpm search:posts [options] <query>',
    '',
    'Options:',
    '  -n, --limit <count>  Number of results to show. Default: 5',
    '  --json              Print machine-readable JSON',
    '  --hybrid            Include vector search. Requires AI Gateway auth',
    '  -h, --help          Show this help',
  ].join('\n')
}

function parseArgs(argv: string[]): CliOptions {
  const query: string[] = []
  let limit = 5
  let json = false
  let hybrid = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '-h' || arg === '--help') {
      console.log(usage())
      process.exit(0)
    }

    if (arg === '--json') {
      json = true
      continue
    }

    if (arg === '--hybrid') {
      hybrid = true
      continue
    }

    if (arg === '-n' || arg === '--limit') {
      const raw = argv[i + 1]
      if (!raw) {
        throw new Error(`${arg} requires a count`)
      }
      const parsed = Number.parseInt(raw, 10)
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 25) {
        throw new Error('limit must be an integer from 1 to 25')
      }
      limit = parsed
      i++
      continue
    }

    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }

    query.push(arg)
  }

  const text = query.join(' ').trim()
  if (text.length < 2) {
    throw new Error('query must be at least 2 characters')
  }

  return { query: text, limit, json, hybrid }
}

function stripWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const search = await hybridSearchPosts(options.query, {
    limit: options.limit,
    maxExcerpts: 2,
    useVector: options.hybrid,
  })

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          query: options.query,
          mode: search.mode,
          results: search.results,
        },
        null,
        2
      )
    )
    return
  }

  console.log(`Search mode: ${search.mode}`)
  if (search.results.length === 0) {
    console.log('No results.')
    return
  }

  for (const [index, result] of search.results.entries()) {
    console.log(
      `${index + 1}. ${result.title} (${result.url}) [${result.newsletter}]`
    )
    for (const excerpt of result.excerpts) {
      console.log(`   ${stripWhitespace(excerpt.text)}`)
      if (excerpt.section) {
        console.log(
          `   Section: ${excerpt.section.heading} (${excerpt.section.url})`
        )
      }
    }
    if (index < search.results.length - 1) console.log('')
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`Search failed: ${message}`)
  console.error(usage())
  process.exit(1)
})
