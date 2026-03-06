import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ModelService } from "../../src/services/model.service.js";
import { runHiringManager } from "../../src/agents/hiring-manager.js";

const mockComplete = vi.fn<(systemPrompt: string, userPrompt: string) => Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => {
  mockComplete.mockReset();
});

describe("runHiringManager", () => {
  it("happy path: returns parsed and validated output", async () => {
    const payload = {
      matchScore: 82,
      cvLanguage: "en",
      missingKeywords: ["k1"],
      summary: "s",
    };
    mockComplete.mockResolvedValue(JSON.stringify(payload));

    const result = await runHiringManager(mockService, "jd", "cv");

    expect(result.matchScore).toBe(82);
    expect(result.cvLanguage).toBe("en");
    expect(result.missingKeywords).toEqual(["k1"]);
    expect(result.summary).toBe("s");
  });

  it("bad JSON: rejects with SyntaxError", async () => {
    mockComplete.mockResolvedValue("not json");

    await expect(runHiringManager(mockService, "jd", "cv")).rejects.toThrow(
      SyntaxError,
    );
  });

  it("schema mismatch: rejects when matchScore is wrong type", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ matchScore: "bad" }));

    await expect(runHiringManager(mockService, "jd", "cv")).rejects.toThrow();
  });
});
