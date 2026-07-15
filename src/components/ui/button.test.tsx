import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Button } from '@/components/ui/button'

describe('Button', () => {
  it('keeps its original label in the layout while loading', () => {
    const html = renderToStaticMarkup(
      <Button loading loadingLabel="Saving">
        Save changes
      </Button>
    )

    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('opacity-0')
    expect(html).toContain('Save changes')
    expect(html).toContain('Saving')
  })

  it('uses a screen-reader loading label when no visible label is supplied', () => {
    const html = renderToStaticMarkup(<Button loading>Refresh</Button>)

    expect(html).toContain('class="sr-only">Loading</span>')
  })
})
