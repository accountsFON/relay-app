import '@testing-library/jest-dom'

// jsdom has no ResizeObserver; components that observe element size (e.g.
// ScrollableContent) crash without this stub. No-op is sufficient for unit tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}
