import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom doesn't ship IntersectionObserver, but the infinite-scroll sentinel
// in LeadsList wires one up on mount. A no-op stub keeps render() happy and
// lets tests assert on the surrounding UI without needing real visibility.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return []
    }
    readonly root: Element | Document | null = null
    readonly rootMargin: string = ''
    readonly thresholds: ReadonlyArray<number> = []
  }
  ;(globalThis as { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver
}

// jsdom doesn't ship ResizeObserver, but @tanstack/react-virtual observes the
// scroll element and measured rows with one. A no-op stub keeps the virtualized
// lead lists rendering; row sizes fall back to the virtualizer's estimates.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(globalThis as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
}

// jsdom performs no layout, so every element reports offsetWidth/offsetHeight
// of 0. The virtualized lead lists size their viewport from the scroll
// element's offset dimensions; report a laptop-ish viewport so a realistic
// window of rows mounts in tests. No component branches on a 0 offset size.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => 1200,
})
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 800,
})

// jsdom doesn't ship PointerEvent, but @base-ui/react components fire one on
// click/keypress. Polyfill it to a MouseEvent-shaped class so click handlers run.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventPolyfill extends MouseEvent {
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
      this.pointerType = params.pointerType ?? ''
      this.isPrimary = params.isPrimary ?? false
    }
    pointerId: number
    pointerType: string
    isPrimary: boolean
  }
  // @ts-expect-error — assigning to global on purpose
  globalThis.PointerEvent = PointerEventPolyfill
}

// Tests run without Redis. The rate limiter fails open in production when
// Redis is unreachable, but in CI we don't want to emit a warning on every
// auth procedure call. Mock the limiter to a no-op; tests that exercise
// limiter behavior import the real module directly with `vi.importActual`.
vi.mock('@/lib/rateLimit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ ok: true, remaining: 999, resetAt: Date.now() + 60_000 }),
  assertWithinRateLimit: vi.fn().mockResolvedValue(undefined),
  getClientIp: vi.fn().mockReturnValue('test-client'),
}))

// The auth snapshot cache is Redis-backed. Tests don't run Redis, so make
// the invalidation helper a no-op. The real read/write paths still flow
// through safeGet/safeSetEx which fail gracefully when Redis is absent.
vi.mock('@/lib/redis', () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(0),
    multi: vi.fn(() => ({
      incr: vi.fn().mockReturnThis(),
      incrby: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      pttl: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue(null),
    })),
    on: vi.fn(),
  },
  safeGet: vi.fn().mockResolvedValue(null),
  safeSetEx: vi.fn().mockResolvedValue(true),
  safeDel: vi.fn().mockResolvedValue(undefined),
}))
