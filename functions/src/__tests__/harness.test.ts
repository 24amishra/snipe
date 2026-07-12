import { describe, it, expect } from "vitest";

// Smoke test proving the harness runs. The autofix pipeline adds its
// reproduction tests to this directory (config/snipe.yaml repro_test_dir).
describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
