/** Delivery-free preview. --live calls Astra; this script never imports SES. */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  buildMorningReportContent,
  fallbackMorningReportCopy,
  morningReportClock,
} from '@/lib/morning-report/content'
import { generateMorningReportCopy } from '@/lib/morning-report/copy'
import { renderMorningReport } from '@/lib/morning-report/render'

async function main() {
  const date =
    process.argv.find((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)) ??
    morningReportClock().date
  const content = buildMorningReportContent(date)
  const generated = process.argv.includes('--live')
    ? await generateMorningReportCopy(content)
    : {
        copy: fallbackMorningReportCopy(content),
        model: null,
        generationId: null,
      }
  const rendered = renderMorningReport(content, generated.copy)
  const directory = path.join('/tmp', `morning-report-${date}`)
  await mkdir(directory, { recursive: true })
  await Promise.all([
    writeFile(path.join(directory, 'report.html'), rendered.html),
    writeFile(path.join(directory, 'report.txt'), rendered.text),
    writeFile(
      path.join(directory, 'report.json'),
      JSON.stringify({ content, ...generated }, null, 2)
    ),
  ])
  console.log(
    JSON.stringify(
      {
        directory,
        model: generated.model,
        generationId: generated.generationId,
        subject: generated.copy.subject,
        anniversaries: content.anniversaries.length,
        photo: content.photo?.url ?? null,
      },
      null,
      2
    )
  )
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Preview failed')
  process.exitCode = 1
})
