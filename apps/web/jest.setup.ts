import '@testing-library/jest-dom';

// sonner's Toaster renders into a portal that jsdom doesn't need for
// assertions — tests assert on toast.success/toast.error calls directly
// instead of querying rendered toast DOM nodes.
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
  Toaster: () => null,
}));

// next-themes needs a real browser matchMedia; jsdom doesn't implement it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Radix's Select (@/components/ui/select, used app-wide — ResumeVariantSelect,
// job target form, template gallery, theme editor, credits, …) calls these
// three Element methods when opening/positioning its popover; jsdom
// implements none of them, so any test that opens a Select throws without
// these no-op stubs. Same category of gap as matchMedia above.
Element.prototype.scrollIntoView = jest.fn();
Element.prototype.hasPointerCapture = jest.fn().mockReturnValue(false);
Element.prototype.releasePointerCapture = jest.fn();
