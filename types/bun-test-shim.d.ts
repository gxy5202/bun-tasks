// Minimal shims for Bun test/types in this project to satisfy TypeScript in tests.
// Bun provides the actual implementations at runtime.

declare module "bun:test" {
  export const describe: (name: string, fn: () => void | Promise<void>) => void;
  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const expect: any;
  export const beforeEach: (fn: () => void | Promise<void>) => void;
  export const afterEach: (fn: () => void | Promise<void>) => void;
}

// Bun global minimal typing for tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Bun: any;
