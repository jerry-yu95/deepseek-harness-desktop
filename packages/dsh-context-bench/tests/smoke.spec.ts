import { describe, expect, it } from "vitest";

import { BENCHMARK_SCHEMA_VERSION } from "../src/schema.ts";
import { DETERMINISTIC_TIER } from "../src/runner/deterministic.ts";

describe("context benchmark package", () => {
  it("exports its stable schema and deterministic tier", () => {
    expect(BENCHMARK_SCHEMA_VERSION).toBe(1);
    expect(DETERMINISTIC_TIER).toBe("deterministic");
  });
});
