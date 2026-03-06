import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ModelService } from "../../src/services/model.service.js";
import { runRewriteResume } from "../../src/agents/rewrite-resume.js";

const mockComplete = vi.fn<(systemPrompt: string, userPrompt: string) => Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => {
  mockComplete.mockReset();
});

describe("runRewriteResume", () => {
  it("happy path: returns parsed and validated output", async () => {
    const payload = {
      updatedCvHtml: "<p>cv</p>",
      keywordsNotAdded: [],
    };
    mockComplete.mockResolvedValue(JSON.stringify(payload));

    const result = await runRewriteResume(mockService, ["k1"], "<p>old</p>", "en");

    expect(result.updatedCvHtml).toBeTruthy();
    expect(result.keywordsNotAdded).toEqual([]);
  });

  it("bad JSON: rejects with SyntaxError", async () => {
    mockComplete.mockResolvedValue("not json");

    await expect(
      runRewriteResume(mockService, [], "<p>cv</p>", "en"),
    ).rejects.toThrow(SyntaxError);
  });

  it("schema mismatch: rejects when updatedCvHtml is wrong type", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ updatedCvHtml: 123 }));

    await expect(
      runRewriteResume(mockService, [], "<p>cv</p>", "en"),
    ).rejects.toThrow();
  });
});
