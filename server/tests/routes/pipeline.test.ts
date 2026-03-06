import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { ZodError } from "zod";

// Mock orchestrator before importing the router so the router picks up the mock
vi.mock("../../src/agents/orchestrator.js", () => ({
  runPipeline: vi.fn(),
}));

// Mock auth so we don't need a real JWT in every test
vi.mock("../../src/middleware/auth.js", () => ({
  requireAuth: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// Mock rate limiter so it never blocks
vi.mock("../../src/middleware/rateLimit.js", () => ({
  rateLimiter: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

// Import the router AFTER mocks are in place
import { pipelineRouter } from "../../src/routes/pipeline.js";
import { runPipeline } from "../../src/agents/orchestrator.js";

const mockRunPipeline = vi.mocked(runPipeline);

// Build a minimal app — intentionally does NOT import index.ts
// because index.ts calls process.exit(1) and app.listen() at module level
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/pipeline", pipelineRouter);
  return app;
}

const VALID_BODY = {
  jobDescription: "We need an SRE.",
  cvTemplate: "<html>cv</html>",
};

const PIPELINE_RESPONSE = {
  steps: [
    { step: 1 as const, name: "hiring-manager", output: {}, durationMs: 10 },
    { step: 2 as const, name: "rewrite-resume", output: {}, durationMs: 10 },
    { step: 3 as const, name: "ats-scanner", output: {}, durationMs: 10 },
    { step: 4 as const, name: "verifier", output: {}, durationMs: 10 },
  ],
  finalCv: "<html>updated cv</html>",
};

describe("POST /pipeline", () => {
  beforeEach(() => {
    mockRunPipeline.mockReset();
  });

  it("returns 200 with PipelineResponse shape on a valid request", async () => {
    mockRunPipeline.mockResolvedValueOnce(PIPELINE_RESPONSE);
    const res = await request(buildApp())
      .post("/pipeline")
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.steps)).toBe(true);
    expect(res.body.steps).toHaveLength(4);
    expect(typeof res.body.finalCv).toBe("string");
  });

  it("returns 400 when jobDescription is missing", async () => {
    const res = await request(buildApp())
      .post("/pipeline")
      .send({ cvTemplate: "<html>cv</html>" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("returns 400 when cvTemplate exceeds 100k characters", async () => {
    const res = await request(buildApp())
      .post("/pipeline")
      .send({ jobDescription: "job", cvTemplate: "x".repeat(100_001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("returns 500 when runPipeline throws a generic Error", async () => {
    mockRunPipeline.mockRejectedValueOnce(new Error("Something went wrong"));
    const res = await request(buildApp())
      .post("/pipeline")
      .send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Pipeline failed");
    // Raw error message must not be leaked
    expect(res.body.message).toBeUndefined();
  });

  it("returns 502 when runPipeline throws a SyntaxError", async () => {
    mockRunPipeline.mockRejectedValueOnce(new SyntaxError("Unexpected token"));
    const res = await request(buildApp())
      .post("/pipeline")
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Model returned invalid JSON");
  });

  it("returns 502 when runPipeline throws a ZodError", async () => {
    // Produce a real ZodError so instanceof check in the route works correctly
    let zodErr: ZodError;
    try {
      const { z } = await import("zod");
      z.object({ x: z.string() }).parse({ x: 123 });
    } catch (e) {
      zodErr = e as ZodError;
    }
    mockRunPipeline.mockRejectedValueOnce(zodErr!);
    const res = await request(buildApp())
      .post("/pipeline")
      .send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Model returned unexpected schema");
  });
});
