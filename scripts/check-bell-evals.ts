import { runDeterministicBellEvals } from '@/lib/chat/evals/deterministic'

async function main() {
  const results = await runDeterministicBellEvals()
  for (const result of results) {
    console.log(
      `${result.passed ? 'PASS' : 'FAIL'} ${result.category}/${result.id}: ${result.detail}`
    )
  }

  const failures = results.filter((result) => !result.passed)
  if (failures.length > 0) {
    throw new Error(
      `${failures.length} deterministic Bell evaluation(s) failed`
    )
  }
  console.log(`Bell evaluations passed: ${results.length}/${results.length}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
