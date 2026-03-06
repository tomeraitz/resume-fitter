import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ModelService } from "../../src/services/model.service.js";
import { runAtsScanner } from "../../src/agents/ats-scanner.js";

const mockComplete = vi.fn<(systemPrompt: string, userPrompt: string) => Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => {
  mockComplete.mockReset();
});

describe("runAtsScanner", () => {
  it("happy path: returns parsed and validated output", async () => {
    const payload = { atsScore: 90, problemAreas: [] };
    mockComplete.mockResolvedValue(JSON.stringify(payload));

    const result = await runAtsScanner(mockService, "<p>cv</p>");

    expect(result.atsScore).toBe(90);
    expect(result.problemAreas).toEqual([]);
  });

  it("bad JSON: rejects with SyntaxError", async () => {
    mockComplete.mockResolvedValue("not json");

    await expect(runAtsScanner(mockService, "<p>cv</p>")).rejects.toThrow(
      SyntaxError,
    );
  });

  it("schema mismatch: rejects when atsScore is wrong type", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ atsScore: "bad" }));

    await expect(runAtsScanner(mockService, "<p>cv</p>")).rejects.toThrow();
  });
});
