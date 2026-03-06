import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { requireAuth } from "../../src/middleware/auth.js";

const TEST_SECRET = "test-secret-for-auth-middleware";

// Minimal mock builders — typed so no `any` leaks in
function makeReq(headers: Record<string, string> = {}): Request {
  return { headers } as unknown as Request;
}

function makeRes() {
  const res = {
    _status: 0,
    _body: {} as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  };
  return res;
}

function makeNext(): { fn: NextFunction; called: boolean } {
  const tracker = { fn: (() => {}) as NextFunction, called: false };
  tracker.fn = () => { tracker.called = true; };
  return tracker;
}

describe("requireAuth middleware", () => {
  beforeEach(() => {
    process.env["SESSION_SECRET"] = TEST_SECRET;
  });

  it("calls next() and sets req.user for a valid HS256 JWT", () => {
    const token = jwt.sign({ sub: "user-1" }, TEST_SECRET, { algorithm: "HS256" });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const res = makeRes();
    const next = makeNext();

    requireAuth(req, res as unknown as Response, next.fn);

    expect(next.called).toBe(true);
    expect((req as Request & { user: unknown }).user).toBeDefined();
  });

  it("returns 401 when Authorization header is absent", () => {
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();

    requireAuth(req, res as unknown as Response, next.fn);

    expect(res._status).toBe(401);
    expect((res._body as { error: string }).error).toBe(
      "Missing or malformed Authorization header",
    );
    expect(next.called).toBe(false);
  });

  it("returns 401 when header lacks the Bearer prefix", () => {
    const token = jwt.sign({ sub: "user-1" }, TEST_SECRET, { algorithm: "HS256" });
    const req = makeReq({ authorization: token }); // no "Bearer " prefix
    const res = makeRes();
    const next = makeNext();

    requireAuth(req, res as unknown as Response, next.fn);

    expect(res._status).toBe(401);
    expect((res._body as { error: string }).error).toBe(
      "Missing or malformed Authorization header",
    );
    expect(next.called).toBe(false);
  });

  it("returns 401 for an invalid token string", () => {
    const req = makeReq({ authorization: "Bearer not.a.valid.jwt" });
    const res = makeRes();
    const next = makeNext();

    requireAuth(req, res as unknown as Response, next.fn);

    expect(res._status).toBe(401);
    expect((res._body as { error: string }).error).toBe("Invalid or expired token");
    expect(next.called).toBe(false);
  });

  it("returns 401 for an expired JWT", () => {
    // Sign with a negative expiresIn so the token is already expired
    const token = jwt.sign({ sub: "user-1" }, TEST_SECRET, {
      algorithm: "HS256",
      expiresIn: -1,
    });
    const req = makeReq({ authorization: `Bearer ${token}` });
    const res = makeRes();
    const next = makeNext();

    requireAuth(req, res as unknown as Response, next.fn);

    expect(res._status).toBe(401);
    expect((res._body as { error: string }).error).toBe("Invalid or expired token");
    expect(next.called).toBe(false);
  });
});
