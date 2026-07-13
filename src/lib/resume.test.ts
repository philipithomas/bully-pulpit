import { describe, expect, it } from 'vitest'
import {
  resumeEducation,
  resumeExperience,
  resumePublicText,
  resumeSecurityCredit,
} from '@/lib/resume'

describe('resume data', () => {
  it('keeps the work history in reverse chronological order', () => {
    expect(resumeExperience.map((entry) => entry.company)).toEqual([
      'Chroma',
      'Find AI',
      'Contraption Co.',
      'Webflow',
      'Trusted Health',
      'Moonlight',
      'Staffjoy',
      'OpenDNS, acquired by Cisco',
    ])
  })

  it('uses ISO dates and secure external URLs throughout', () => {
    for (const entry of [...resumeExperience, resumeEducation]) {
      expect(entry.start).toMatch(/^\d{4}(?:-\d{2})?$/)
      expect(entry.end).toMatch(/^\d{4}(?:-\d{2})?$/)
      expect(entry.companyUrl).toMatch(/^https:\/\//)
      for (const item of entry.media ?? []) {
        expect(item.url).toMatch(/^https:\/\//)
      }
    }
    expect(resumeSecurityCredit.url).toMatch(/^https:\/\//)
  })

  it('builds complete deterministic text for search and Bell', () => {
    for (const entry of [...resumeExperience, resumeEducation]) {
      expect(resumePublicText).toContain(entry.company)
      expect(resumePublicText).toContain(entry.role)
      for (const highlight of entry.highlights) {
        expect(resumePublicText).toContain(highlight)
      }
    }
    expect(resumePublicText).toContain(resumeSecurityCredit.title)
  })
})
