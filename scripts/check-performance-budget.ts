/** Post-build guard for initial client JavaScript on key public routes. */

import { join } from 'node:path'
import { evaluateBudgets, formatBytes } from '@/lib/performance/route-js-budget'

const buildDir = join(process.cwd(), '.next')
const { errors, measurements } = evaluateBudgets(buildDir)

if (errors.length > 0) {
  console.error('Performance budget check failed:\n')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}

console.log('Performance budget check passed:')
for (const measurement of measurements) {
  const routeDetail =
    measurement.routeCount > 1
      ? `; largest ${measurement.measuredRoute} of ${measurement.routeCount}`
      : ''
  console.log(
    `  ${measurement.label}: ${formatBytes(measurement.brotliBytes)} / ${formatBytes(measurement.maximumBytes)} (${measurement.chunks.length} initial chunks${routeDetail})`
  )
}
