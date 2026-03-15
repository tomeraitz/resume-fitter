import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { ZodError } from "zod";
import { APICallError } from "ai";

// Mock agents before importing the router
vi.mock("../../src/agents/job-extractor.js", () => ({
  runJobExtractor: vi.fn(),
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
import { extractRouter } from "../../src/routes/extract.js";
import { runJobExtractor } from "../../src/agents/job-extractor.js";

const mockRunJobExtractor = vi.mocked(runJobExtractor);

// Build a minimal app — intentionally does NOT import index.ts
// because index.ts calls process.exit(1) and app.listen() at module level
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", extractRouter);
  return app;
}

const VALID_BODY = { html: "<div><p>Software Engineer at Acme Corp</p></div>" };

const JOB_RESULT = {
  isJobPosting: true as const,
  jobDetails: {
    title: "SWE",
    company: "Acme",
    location: "Remote",
    skills: ["TypeScript"],
    description: "Build stuff",
  },
};

const NOT_A_JOB_RESULT = {
  isJobPosting: false as const,
  reason: "blog post",
};

describe("POST /extract", () => {
  beforeEach(() => {
    mockRunJobExtractor.mockReset();
  });

  it("returns 200 with job details on valid request", async () => {
    mockRunJobExtractor.mockResolvedValueOnce(JOB_RESULT);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe("SWE");
    expect(res.body.company).toBe("Acme");
    expect(res.body.location).toBe("Remote");
    expect(res.body.skills).toEqual(["TypeScript"]);
    expect(res.body.description).toBe("Build stuff");
  });

  it("returns 400 when html is missing", async () => {
    const res = await request(buildApp()).post("/").send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("returns 400 when html is empty", async () => {
    const res = await request(buildApp()).post("/").send({ html: "" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("returns 422 when page is not a job posting", async () => {
    mockRunJobExtractor.mockResolvedValueOnce(NOT_A_JOB_RESULT);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(422);
    expect(res.body.error).toBe("Not a job posting");
    expect(res.body.reason).toBe("blog post");
  });

  it("returns 502 when agent throws SyntaxError", async () => {
    mockRunJobExtractor.mockRejectedValueOnce(new SyntaxError("Unexpected token"));

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Model returned invalid JSON");
  });

  it("returns 502 when agent throws ZodError", async () => {
    let zodErr: ZodError;
    try {
      const { z } = await import("zod");
      z.object({ x: z.string() }).parse({ x: 123 });
    } catch (e) {
      zodErr = e as ZodError;
    }
    mockRunJobExtractor.mockRejectedValueOnce(zodErr!);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Model returned unexpected schema");
  });

  it("returns 503 when agent throws a retryable APICallError", async () => {
    const retryableErr = new APICallError({
      message: "rate limit",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: {},
      responseBody: "",
      isRetryable: true,
    });
    mockRunJobExtractor.mockRejectedValueOnce(retryableErr);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Service temporarily unavailable");
  });

  it("returns 500 on generic error without leaking message", async () => {
    mockRunJobExtractor.mockRejectedValueOnce(new Error("boom"));

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Extraction failed");
    expect(res.body.message).toBeUndefined();
  });

  it("passes through long field values unchanged", async () => {
    const longTitle = "A".repeat(200);
    const longDescription = "B".repeat(4000);
    const longResult = {
      isJobPosting: true as const,
      jobDetails: {
        title: longTitle,
        company: "BigCorp",
        location: "San Francisco, CA, United States of America",
        skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "Kubernetes"],
        description: longDescription,
      },
    };
    mockRunJobExtractor.mockResolvedValueOnce(longResult);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe(longTitle);
    expect(res.body.description).toBe(longDescription);
    expect(res.body.skills).toHaveLength(6);
  });

  it("returns 401 when no Bearer token is provided (real requireAuth)", async () => {
    // Build a fresh app with the real requireAuth, bypassing the vi.mock
    const { requireAuth: realRequireAuth } = await vi.importActual<typeof import("../../src/middleware/auth.js")>(
      "../../src/middleware/auth.js",
    );
    const { rateLimiter: realRateLimiter } = await vi.importActual<typeof import("../../src/middleware/rateLimit.js")>(
      "../../src/middleware/rateLimit.js",
    );

    const appWithRealAuth = express();
    appWithRealAuth.use(express.json());

    const realRouter = express.Router();
    realRouter.post("/", realRequireAuth, realRateLimiter, async (req, res) => {
      res.json({ ok: true });
    });
    appWithRealAuth.use("/", realRouter);

    process.env["SESSION_SECRET"] = "test-secret-for-extract-route";

    const res = await request(appWithRealAuth).post("/").send(VALID_BODY);

    expect(res.status).toBe(401);
  });
});
