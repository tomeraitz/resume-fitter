/**
 * Pipeline benchmark tests.
 *
 * These tests make REAL HTTP calls to live providers and measure timing.
 * They are gated behind RUN_BENCHMARK_TESTS=true so they never run in CI.
 *
 * To run:
 *   npm run test:benchmark
 *
 * Results are logged to console for human review. No % improvement is asserted —
 * only that the optimized run produces valid output.
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

// ── Helpers ─────────────────────────────────────────────────────────────────

interface BenchmarkMetrics {
  totalDurationMs: number;
  perStepDurationMs: number[];
  promptCharCounts: { jobDescription: number; cvTemplate: number; history: number };
}

function extractMetrics(result: PipelineResponse, cvInput: string): BenchmarkMetrics {
  return {
    totalDurationMs: result.steps.reduce((sum, s) => sum + s.durationMs, 0),
    perStepDurationMs: result.steps.map((s) => s.durationMs),
    promptCharCounts: {
      jobDescription: jobDescription.length,
      cvTemplate: cvInput.length,
      history: history.length,
    },
  };
}

function logComparison(flag: string, baseline: BenchmarkMetrics, optimized: BenchmarkMetrics): void {
  const diff = baseline.totalDurationMs - optimized.totalDurationMs;
  const pct = ((diff / baseline.totalDurationMs) * 100).toFixed(1);
  console.log(`\n── ${flag} ─────────────────────────────────`);
  console.log(`  Baseline total:  ${baseline.totalDurationMs}ms`);
  console.log(`  Optimized total: ${optimized.totalDurationMs}ms`);
  console.log(`  Delta: ${diff >= 0 ? "-" : "+"}${Math.abs(diff)}ms (${diff >= 0 ? pct + "% faster" : Math.abs(Number(pct)) + "% slower"})`);
  console.log(`  Baseline steps:  ${baseline.perStepDurationMs.join("ms, ")}ms`);
  console.log(`  Optimized steps: ${optimized.perStepDurationMs.join("ms, ")}ms`);
  console.log(`  Input chars (baseline): cv=${baseline.promptCharCounts.cvTemplate}`);
  console.log(`  Input chars (optimized): cv=${optimized.promptCharCounts.cvTemplate}`);
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

// ── OPTIMIZATION_HTML_STRIP benchmark ───────────────────────────────────────

describeIf(RUN)("Benchmark: OPTIMIZATION_HTML_STRIP", () => {
  let baselineResult: PipelineResponse;
  let optimizedResult: PipelineResponse;

  beforeAll(async () => {
    try {
      process.env["OPTIMIZATION_HTML_STRIP"] = "false";
      baselineResult = await runPipeline({ jobDescription, cvTemplate, history });

      process.env["OPTIMIZATION_HTML_STRIP"] = "true";
      optimizedResult = await runPipeline({ jobDescription, cvTemplate, history });
    } finally {
      process.env["OPTIMIZATION_HTML_STRIP"] = "false";
    }
  }, 300_000);

  it("optimized run produces valid output", () => {
    assertValidOutput(optimizedResult);
  });

  it("baseline run produces valid output", () => {
    assertValidOutput(baselineResult);
  });

  it("logs side-by-side timing comparison", () => {
    const baseline = extractMetrics(baselineResult, cvTemplate);
    const optimized = extractMetrics(optimizedResult, cvTemplate);
    logComparison("OPTIMIZATION_HTML_STRIP", baseline, optimized);
    // Always passes — this test exists to surface the log output
    expect(true).toBe(true);
  });
});

// ── OPTIMIZATION_PROMPT_CACHING benchmark ───────────────────────────────────

describeIf(RUN)("Benchmark: OPTIMIZATION_PROMPT_CACHING", () => {
  let baselineResult: PipelineResponse;
  let optimizedResult: PipelineResponse;

  beforeAll(async () => {
    try {
      process.env["OPTIMIZATION_PROMPT_CACHING"] = "false";
      baselineResult = await runPipeline({ jobDescription, cvTemplate, history });

      // Only effective when provider=anthropic
      process.env["OPTIMIZATION_PROMPT_CACHING"] = "true";
      optimizedResult = await runPipeline({ jobDescription, cvTemplate, history });
    } finally {
      process.env["OPTIMIZATION_PROMPT_CACHING"] = "false";
    }
  }, 300_000);

  it("optimized run produces valid output", () => {
    assertValidOutput(optimizedResult);
  });

  it("baseline run produces valid output", () => {
    assertValidOutput(baselineResult);
  });

  it("logs side-by-side timing comparison", () => {
    const baseline = extractMetrics(baselineResult, cvTemplate);
    const optimized = extractMetrics(optimizedResult, cvTemplate);
    logComparison("OPTIMIZATION_PROMPT_CACHING", baseline, optimized);
    expect(true).toBe(true);
  });
});

// ── OPTIMIZATION_SSE benchmark ──────────────────────────────────────────────

describeIf(RUN)("Benchmark: OPTIMIZATION_SSE", () => {
  let baselineResult: PipelineResponse;
  let optimizedResult: PipelineResponse;

  beforeAll(async () => {
    // SSE affects transport, not pipeline execution time.
    // Both runs call runPipeline directly to measure core pipeline performance.
    try {
      process.env["OPTIMIZATION_SSE"] = "false";
      baselineResult = await runPipeline({ jobDescription, cvTemplate, history });

      process.env["OPTIMIZATION_SSE"] = "true";
      optimizedResult = await runPipeline({ jobDescription, cvTemplate, history });
    } finally {
      process.env["OPTIMIZATION_SSE"] = "false";
    }
  }, 300_000);

  it("optimized run produces valid output", () => {
    assertValidOutput(optimizedResult);
  });

  it("baseline run produces valid output", () => {
    assertValidOutput(baselineResult);
  });

  it("logs side-by-side timing comparison", () => {
    const baseline = extractMetrics(baselineResult, cvTemplate);
    const optimized = extractMetrics(optimizedResult, cvTemplate);
    logComparison("OPTIMIZATION_SSE", baseline, optimized);
    expect(true).toBe(true);
  });
});
