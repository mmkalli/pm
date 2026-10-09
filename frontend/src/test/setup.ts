import "@testing-library/jest-dom";

// Node 26 defines its own global localStorage (undefined without --localstorage-file),
// which hides the jsdom one. Use jsdom's storage in tests.
Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage,
  configurable: true,
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
