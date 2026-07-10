import { OTPInputContext } from 'input-otp'
import type { ContextType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

describe('InputOTPSlot', () => {
  it('gives only the current filled slot one clean active border', () => {
    const context = {
      slots: Array.from({ length: 6 }, (_, index) => ({
        char: String(index + 1),
        placeholderChar: null,
        isActive: index === 4,
        hasFakeCaret: false,
      })),
      isFocused: true,
      isHovering: false,
    } satisfies ContextType<typeof OTPInputContext>

    const html = renderToStaticMarkup(
      <OTPInputContext.Provider value={context}>
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </OTPInputContext.Provider>
    )

    expect(html.match(/data-active="true"/g)).toHaveLength(1)
    expect(html.match(/data-active="false"/g)).toHaveLength(5)
    expect(html).toContain('border border-input')
    expect(html).toContain('data-[active=true]:border-gray-900')
    expect(html).not.toContain('ring-')
    expect(html).not.toContain('shadow')
  })
})
