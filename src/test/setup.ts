import '@testing-library/jest-dom'

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
