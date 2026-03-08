/**
 * Pipeline benchmark tests.
 *
 * Runs the full pipeline TWICE using real LLM API calls:
 *   - Baseline: all optimization flags OFF
 *   - Optimized: all optimization flags ON
 *
 * All per-flag comparisons share these two runs.
 * Gated behind RUN_BENCHMARK_TESTS=true — never runs in CI.
 *
 * To run:
 *   npm run test:benchmark
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, beforeAll } from "vitest";
import { runPipeline } from "../../src/agents/orchestrator.js";
import type { PipelineResponse } from "../../src/types/pipeline.types.js";

const RUN = process.env["RUN_BENCHMARK_TESTS"] === "true";
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

// ── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURES_DIR = join(import.meta.dirname, "../fixtures");

const cvTemplate = readFileSync(
  join(FIXTURES_DIR, "cv-templates/single-column-cv.html"),
  "utf8",
);
const jobDescription = readFileSync(
  join(FIXTURES_DIR, "job-descriptions/fullstack-role.txt"),
  "utf8",
);
const history = readFileSync(
  join(FIXTURES_DIR, "histories/candidate-history.md"),
  "utf8",
);

// ── Shared pipeline runs ─────────────────────────────────────────────────────
// One baseline (all flags off) + one optimized (all flags on).
// Both runs use the same fixtures so results are directly comparable.

let baselineResult: PipelineResponse;
let optimizedResult: PipelineResponse;

if (RUN) {
  beforeAll(async () => {
    const FLAGS = ["OPTIMIZATION_HTML_STRIP", "OPTIMIZATION_PROMPT_CACHING", "OPTIMIZATION_SSE"];
    try {
      FLAGS.forEach((f) => { process.env[f] = "false"; });
      baselineResult = await runPipeline({ jobDescription, cvTemplate, history });

      FLAGS.forEach((f) => { process.env[f] = "true"; });
      optimizedResult = await runPipeline({ jobDescription, cvTemplate, history });
    } finally {
      FLAGS.forEach((f) => { process.env[f] = "false"; });
    }
  }, 900_000);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

interface BenchmarkMetrics {
  totalDurationMs: number;
  perStepDurationMs: number[];
}

function extractMetrics(result: PipelineResponse): BenchmarkMetrics {
  return {
    totalDurationMs: result.steps.reduce((sum, s) => sum + s.durationMs, 0),
    perStepDurationMs: result.steps.map((s) => s.durationMs),
  };
}

function logComparison(label: string, baseline: BenchmarkMetrics, optimized: BenchmarkMetrics): void {
  const diff = baseline.totalDurationMs - optimized.totalDurationMs;
  const pct = ((diff / baseline.totalDurationMs) * 100).toFixed(1);
  console.log(`\n── ${label} ─────────────────────────────────`);
  console.log(`  Baseline total:  ${baseline.totalDurationMs}ms`);
  console.log(`  Optimized total: ${optimized.totalDurationMs}ms`);
  console.log(`  Delta: ${diff >= 0 ? "-" : "+"}${Math.abs(diff)}ms (${diff >= 0 ? pct + "% faster" : Math.abs(Number(pct)) + "% slower"})`);
  console.log(`  Baseline steps:  ${baseline.perStepDurationMs.join("ms, ")}ms`);
  console.log(`  Optimized steps: ${optimized.perStepDurationMs.join("ms, ")}ms`);
  console.log(`  Baseline cv chars:  ${cvTemplate.length}`);
}

function assertValidOutput(result: PipelineResponse): void {
  expect(result.finalCv).toBeTruthy();
  expect(result.finalCv.length).toBeGreaterThan(0);
  expect(result.steps).toHaveLength(4);
  result.steps.forEach((step) => {
    expect(step.durationMs).toBeGreaterThanOrEqual(0);
    expect(step.output).toBeDefined();
  });
}

// ── Validity checks ───────────────────────────────────────────────────────────

describeIf(RUN)("Benchmark: output validity", () => {
  it("baseline run produces valid output", () => {
    assertValidOutput(baselineResult);
  });

  it("optimized run produces valid output", () => {
    assertValidOutput(optimizedResult);
  });
});

// ── Per-flag comparisons (all read from the same two runs) ───────────────────

describeIf(RUN)("Benchmark: ALL_FLAGS comparison", () => {
  it("logs side-by-side timing (all flags off vs all flags on)", () => {
    logComparison("ALL FLAGS", extractMetrics(baselineResult), extractMetrics(optimizedResult));
    expect(true).toBe(true);
  });
});
