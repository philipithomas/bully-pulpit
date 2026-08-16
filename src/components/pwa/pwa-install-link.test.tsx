import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const reactHarness = vi.hoisted(() => ({
  cursor: 0,
  effects: [] as Array<() => undefined | (() => void)>,
  state: [] as unknown[],
}))
const toastHarness = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  })
  return { toast }
})

vi.mock('react', () => ({
  useCallback: <Callback extends (...args: never[]) => unknown>(
    callback: Callback
  ) => callback,
  useEffect: (effect: () => undefined | (() => void)) => {
    reactHarness.effects.push(effect)
  },
  useState: <Value,>(initial: Value) => {
    const index = reactHarness.cursor
    reactHarness.cursor += 1
    if (!(index in reactHarness.state)) reactHarness.state[index] = initial
    const setValue = (next: Value | ((current: Value) => Value)) => {
      const current = reactHarness.state[index] as Value
      reactHarness.state[index] =
        typeof next === 'function'
          ? (next as (current: Value) => Value)(current)
          : next
    }
    return [reactHarness.state[index] as Value, setValue] as const
  },
}))
vi.mock('sonner', () => ({ toast: toastHarness.toast }))

function eventHub() {
  const listeners = new Map<string, Set<(event: unknown) => void>>()
  return {
    addEventListener: vi.fn(
      (type: string, listener: (event: unknown) => void) => {
        const existing = listeners.get(type) ?? new Set()
        existing.add(listener)
        listeners.set(type, existing)
      }
    ),
    dispatch(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
    removeEventListener: vi.fn(
      (type: string, listener: (event: unknown) => void) => {
        listeners.get(type)?.delete(listener)
      }
    ),
  }
}

function installBrowserHarness(options?: {
  maxTouchPoints?: number
  platform?: string
  standalone?: boolean
  userAgent?: string
}) {
  const events = eventHub()
  vi.stubGlobal('navigator', {
    maxTouchPoints: options?.maxTouchPoints ?? 0,
    platform: options?.platform ?? 'Linux x86_64',
    userAgent:
      options?.userAgent ?? 'Mozilla/5.0 Chrome/140.0.0.0 Safari/537.36',
  })
  vi.stubGlobal('window', {
    ...events,
    matchMedia: vi.fn(() => ({ matches: options?.standalone ?? false })),
  })
  return events
}

interface InstallButton {
  props: {
    'data-inverse-focus-ring': boolean
    onClick(): Promise<void>
  }
  type: string
}

async function renderInstallLink(): Promise<InstallButton | null> {
  reactHarness.cursor = 0
  const { PwaInstallLink } = await import('@/components/pwa/pwa-install-link')
  return PwaInstallLink() as InstallButton | null
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  reactHarness.cursor = 0
  reactHarness.effects.length = 0
  reactHarness.state.length = 0
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PWA install link', () => {
  it('uses the native install prompt when the browser provides one', async () => {
    const events = installBrowserHarness()
    expect(await renderInstallLink()).toBeNull()
    reactHarness.effects[0]()

    const prompt = vi.fn().mockResolvedValue(undefined)
    const preventDefault = vi.fn()
    events.dispatch('beforeinstallprompt', {
      preventDefault,
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
    })

    const button = await renderInstallLink()
    expect(button?.type).toBe('button')
    await button?.props.onClick()
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(prompt).toHaveBeenCalledOnce()
    expect(toastHarness.toast.success).toHaveBeenCalledWith(
      'Installed as an app.'
    )
  })

  it('explains manual installation on iPhone and exposes visible focus styling', async () => {
    installBrowserHarness({
      platform: 'iPhone',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit Safari',
    })
    expect(await renderInstallLink()).toBeNull()
    reactHarness.effects[0]()

    const button = await renderInstallLink()
    expect(button?.props['data-inverse-focus-ring']).toBe(true)
    await button?.props.onClick()
    expect(toastHarness.toast).toHaveBeenCalledWith(
      'To install this site, tap Share, then Add to Home Screen.',
      { duration: 8000 }
    )
  })

  it('offers Safari Add to Dock instructions on macOS', async () => {
    installBrowserHarness({
      platform: 'MacIntel',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
    })
    expect(await renderInstallLink()).toBeNull()
    reactHarness.effects[0]()

    const button = await renderInstallLink()
    await button?.props.onClick()
    expect(toastHarness.toast).toHaveBeenCalledWith(
      'In Safari, choose File, then Add to Dock.',
      { duration: 8000 }
    )
  })

  it('stays hidden when already running as an installed app', async () => {
    installBrowserHarness({ standalone: true })
    expect(await renderInstallLink()).toBeNull()
    reactHarness.effects[0]()
    expect(await renderInstallLink()).toBeNull()
  })
})
