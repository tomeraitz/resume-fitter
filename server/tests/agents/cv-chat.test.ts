import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ModelService } from "../../src/services/model.service.js";
import { runCvChat } from "../../src/agents/cv-chat.js";

const mockComplete = vi.fn<(sys: string, user: string) => Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => mockComplete.mockReset());

describe("runCvChat", () => {
  it("happy path: returns parsed output", async () => {
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({ updatedCvHtml: "<p>shorter</p>", flaggedClaims: [] }),
    );
    const result = await runCvChat(mockService, "make it shorter", "<p>long cv</p>");
    expect(result.updatedCvHtml).toBe("<p>shorter</p>");
    expect(result.flaggedClaims).toEqual([]);
  });

  it("surfaces flagged refused instruction", async () => {
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({ updatedCvHtml: "<p>cv</p>", flaggedClaims: ["Cannot add Kubernetes — not in history"] }),
    );
    const result = await runCvChat(mockService, "add Kubernetes", "<p>cv</p>", "history");
    expect(result.flaggedClaims).toHaveLength(1);
  });

  it("history omitted resolves without error", async () => {
    mockComplete.mockResolvedValueOnce(
      JSON.stringify({ updatedCvHtml: "<p>cv</p>", flaggedClaims: [] }),
    );
    const result = await runCvChat(mockService, "shorten", "<p>cv</p>");
    expect(result.updatedCvHtml).toBe("<p>cv</p>");
  });

  it("strips markdown fences", async () => {
    mockComplete.mockResolvedValueOnce(
      "```json\n" + JSON.stringify({ updatedCvHtml: "<p>cv</p>", flaggedClaims: [] }) + "\n```",
    );
    const result = await runCvChat(mockService, "shorten", "<p>cv</p>");
    expect(result.updatedCvHtml).toBe("<p>cv</p>");
  });

  it("rejects with SyntaxError on bad JSON", async () => {
    mockComplete.mockResolvedValueOnce("not json");
    await expect(runCvChat(mockService, "shorten", "<p>cv</p>")).rejects.toThrow(SyntaxError);
  });

  it("rejects with ZodError when updatedCvHtml is wrong type", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ updatedCvHtml: 123, flaggedClaims: [] }));
    await expect(runCvChat(mockService, "shorten", "<p>cv</p>")).rejects.toThrow();
  });

  it("rejects with ZodError when flaggedClaims is not an array", async () => {
    mockComplete.mockResolvedValueOnce(JSON.stringify({ updatedCvHtml: "<p>cv</p>", flaggedClaims: "bad" }));
    await expect(runCvChat(mockService, "shorten", "<p>cv</p>")).rejects.toThrow();
  });
});
