import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Fixture-repo tests spawn real git subprocesses per derivation; under
    // full-suite parallelism a single test can cross the 5s default.
    testTimeout: 20_000,
  },
});
