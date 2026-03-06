import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ModelService } from "../../src/services/model.service.js";
import { runVerifier } from "../../src/agents/verifier.js";

const mockComplete = vi.fn<(systemPrompt: string, userPrompt: string) => Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => {
  mockComplete.mockReset();
});

describe("runVerifier", () => {
  it("happy path: returns parsed and validated output", async () => {
    const payload = { verifiedCv: "<p>ok</p>", flaggedClaims: [] };
    mockComplete.mockResolvedValue(JSON.stringify(payload));

    const result = await runVerifier(mockService, "<p>cv</p>");

    expect(result.verifiedCv).toBeTruthy();
    expect(result.flaggedClaims).toEqual([]);
  });

  it("bad JSON: rejects with SyntaxError", async () => {
    mockComplete.mockResolvedValue("not json");

    await expect(runVerifier(mockService, "<p>cv</p>")).rejects.toThrow(
      SyntaxError,
    );
  });

  it("schema mismatch: rejects when verifiedCv is wrong type", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ verifiedCv: 123 }));

    await expect(runVerifier(mockService, "<p>cv</p>")).rejects.toThrow();
  });
});
