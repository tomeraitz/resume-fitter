import * as http from "http";
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

/**
 * Collect the full SSE response body using Node's native http module.
 * Superagent/supertest consume the stream internally before the custom parser
 * can attach listeners, so we bypass them entirely for SSE routes.
 */
async function getSseText(app: express.Express, body: object): Promise<{ status: number; headers: Record<string, string>; text: string }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      const payload = JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/pipeline',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => { text += chunk; });
        res.on('end', () => { server.close(() => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string>, text })); });
        res.on('error', (err) => server.close(() => reject(err)));
      });
      req.on('error', (err) => server.close(() => reject(err)));
      req.write(payload);
      req.end();
    });
  });
}

/** Parse SSE response text into a list of { event, data } objects. */
function parseSseEvents(text: string): Array<{ event: string; data: unknown }> {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map(block => {
      const lines = block.split('\n');
      const eventLine = lines.find(l => l.startsWith('event:'));
      const dataLine = lines.find(l => l.startsWith('data:'));
      return {
        event: eventLine ? eventLine.slice(7).trim() : '',
        data: dataLine ? JSON.parse(dataLine.slice(5).trim()) : null,
      };
    })
    .filter(e => e.event);
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

  it("streams SSE with step events and a done event on a valid request", async () => {
    mockRunPipeline.mockResolvedValueOnce(PIPELINE_RESPONSE);
    const { status, headers, text } = await getSseText(buildApp(), VALID_BODY);

    expect(status).toBe(200);
    expect(headers['content-type']).toContain('text/event-stream');
    const events = parseSseEvents(text);
    const doneEvent = events.find(e => e.event === 'done');
    expect(doneEvent).toBeDefined();
    expect((doneEvent!.data as any).finalCv).toBe(PIPELINE_RESPONSE.finalCv);
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

  it("streams an error SSE event when runPipeline throws a generic Error", async () => {
    mockRunPipeline.mockRejectedValueOnce(new Error("Something went wrong"));
    const { status, text } = await getSseText(buildApp(), VALID_BODY);

    expect(status).toBe(200);
    const events = parseSseEvents(text);
    const errorEvent = events.find(e => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as any).error).toBe("Pipeline failed");
    // Raw error message must not be leaked
    expect((errorEvent!.data as any).message).toBeUndefined();
  });

  it("streams an error SSE event when runPipeline throws a SyntaxError", async () => {
    mockRunPipeline.mockRejectedValueOnce(new SyntaxError("Unexpected token"));
    const { status, text } = await getSseText(buildApp(), VALID_BODY);

    expect(status).toBe(200);
    const events = parseSseEvents(text);
    const errorEvent = events.find(e => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as any).error).toBe("Model returned invalid JSON");
  });

  it("streams an error SSE event when runPipeline throws a ZodError", async () => {
    // Produce a real ZodError so instanceof check in the route works correctly
    let zodErr: ZodError;
    try {
      const { z } = await import("zod");
      z.object({ x: z.string() }).parse({ x: 123 });
    } catch (e) {
      zodErr = e as ZodError;
    }
    mockRunPipeline.mockRejectedValueOnce(zodErr!);
    const { status, text } = await getSseText(buildApp(), VALID_BODY);

    expect(status).toBe(200);
    const events = parseSseEvents(text);
    const errorEvent = events.find(e => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect((errorEvent!.data as any).error).toBe("Model returned unexpected schema");
  });
});
