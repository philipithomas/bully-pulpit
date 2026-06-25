async function smokeStep(label: string): Promise<{
  label: string
  checkedAt: string
}> {
  'use step'
  return { label, checkedAt: new Date().toISOString() }
}

/** No-op workflow used to verify Vercel Workflow queue delivery after SDK bumps. */
export async function workflowSmokeWorkflow(label: string): Promise<{
  label: string
  checkedAt: string
}> {
  'use workflow'
  return smokeStep(label)
}
