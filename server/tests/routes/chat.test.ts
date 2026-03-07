import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { ZodError } from "zod";
import { APICallError } from "ai";

// Mock agents before importing the router so the router picks up the mocks
vi.mock("../../src/agents/cv-chat.js", () => ({
  runCvChat: vi.fn(),
}));

vi.mock("../../src/agents/verifier.js", () => ({
  runVerifier: vi.fn(),
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
import { chatRouter } from "../../src/routes/chat.js";
import { runCvChat } from "../../src/agents/cv-chat.js";
import { runVerifier } from "../../src/agents/verifier.js";

const mockRunCvChat = vi.mocked(runCvChat);
const mockRunVerifier = vi.mocked(runVerifier);

// Build a minimal app — intentionally does NOT import index.ts
// because index.ts calls process.exit(1) and app.listen() at module level
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/", chatRouter);
  return app;
}

const VALID_BODY = {
  message: "Make it more concise",
  currentCv: "<html><body><p>My CV</p></body></html>",
};

const CHAT_RESULT = {
  updatedCvHtml: "<html><body><p>My CV (concise)</p></body></html>",
  flaggedClaims: [],
};

const VERIFIER_RESULT = {
  verifiedCv: "<html><body><p>My CV (concise)</p></body></html>",
  flaggedClaims: [],
};

describe("POST /chat", () => {
  beforeEach(() => {
    mockRunCvChat.mockReset();
    mockRunVerifier.mockReset();
  });

  it("returns 200 with updatedCvHtml and flaggedClaims on valid request", async () => {
    mockRunCvChat.mockResolvedValueOnce(CHAT_RESULT);
    mockRunVerifier.mockResolvedValueOnce(VERIFIER_RESULT);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(typeof res.body.updatedCvHtml).toBe("string");
    expect(Array.isArray(res.body.flaggedClaims)).toBe(true);
  });

  it("merges flaggedClaims from chat and verifier", async () => {
    mockRunCvChat.mockResolvedValueOnce({
      updatedCvHtml: "<p>cv</p>",
      flaggedClaims: ["Chat refused: add Kubernetes"],
    });
    mockRunVerifier.mockResolvedValueOnce({
      verifiedCv: "<p>cv</p>",
      flaggedClaims: ["Verifier flagged: unverified claim"],
    });

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body.flaggedClaims).toHaveLength(2);
    expect(res.body.flaggedClaims).toContain("Chat refused: add Kubernetes");
    expect(res.body.flaggedClaims).toContain("Verifier flagged: unverified claim");
  });

  it("returns 400 when message is missing", async () => {
    const res = await request(buildApp())
      .post("/")
      .send({ currentCv: "<p>cv</p>" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("returns 400 when currentCv is missing", async () => {
    const res = await request(buildApp())
      .post("/")
      .send({ message: "shorten it" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
    expect(Array.isArray(res.body.details)).toBe(true);
  });

  it("returns 400 when message exceeds 10k characters", async () => {
    const res = await request(buildApp())
      .post("/")
      .send({ message: "x".repeat(10_001), currentCv: "<p>cv</p>" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("returns 400 when currentCv exceeds 100k characters", async () => {
    const res = await request(buildApp())
      .post("/")
      .send({ message: "shorten", currentCv: "x".repeat(100_001) });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("returns 500 when runCvChat throws a generic Error", async () => {
    mockRunCvChat.mockRejectedValueOnce(new Error("Something went wrong"));

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Chat agent failed");
    expect(res.body.message).toBeUndefined();
  });

  it("returns 500 when runVerifier throws a generic Error", async () => {
    mockRunCvChat.mockResolvedValueOnce(CHAT_RESULT);
    mockRunVerifier.mockRejectedValueOnce(new Error("Verifier failed"));

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Chat agent failed");
    expect(res.body.message).toBeUndefined();
  });

  it("returns 502 when an agent throws SyntaxError", async () => {
    mockRunCvChat.mockRejectedValueOnce(new SyntaxError("Unexpected token"));

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Model returned invalid JSON");
  });

  it("returns 502 when an agent throws ZodError", async () => {
    let zodErr: ZodError;
    try {
      const { z } = await import("zod");
      z.object({ x: z.string() }).parse({ x: 123 });
    } catch (e) {
      zodErr = e as ZodError;
    }
    mockRunCvChat.mockRejectedValueOnce(zodErr!);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(502);
    expect(res.body.error).toBe("Model returned unexpected schema");
  });

  it("returns 503 when an agent throws a retryable APICallError", async () => {
    const retryableErr = new APICallError({
      message: "rate limit",
      url: "https://api.anthropic.com",
      requestBodyValues: {},
      statusCode: 429,
      responseHeaders: {},
      responseBody: "",
      isRetryable: true,
    });
    mockRunCvChat.mockRejectedValueOnce(retryableErr);

    const res = await request(buildApp()).post("/").send(VALID_BODY);

    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Service temporarily unavailable");
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

    process.env["SESSION_SECRET"] = "test-secret-for-chat-route";

    const res = await request(appWithRealAuth).post("/").send(VALID_BODY);

    expect(res.status).toBe(401);
  });
});
