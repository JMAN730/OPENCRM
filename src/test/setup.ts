import '@testing-library/jest-dom'
import { vi } from 'vitest'

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
