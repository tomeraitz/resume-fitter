import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ModelService } from "../../src/services/model.service.js";
import { runJobExtractor } from "../../src/agents/job-extractor.js";

const mockComplete = vi.fn<(systemPrompt: string, userPrompt: string) => Promise<string>>();
const mockService = { complete: mockComplete } as unknown as ModelService;

beforeEach(() => {
  mockComplete.mockReset();
});

const VALID_JOB_RESULT = {
  isJobPosting: true,
  jobDetails: {
    title: "SWE",
    company: "Acme",
    location: "Remote",
    skills: ["TypeScript"],
    description: "Build stuff",
  },
};

const NOT_A_JOB_RESULT = {
  isJobPosting: false,
  reason: "This is a blog post",
};

describe("runJobExtractor", () => {
  it("happy path: returns parsed and validated output", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(VALID_JOB_RESULT));

    const result = await runJobExtractor(mockService, "some page content");

    expect(result.isJobPosting).toBe(true);
    if (result.isJobPosting) {
      expect(result.jobDetails.title).toBe("SWE");
      expect(result.jobDetails.company).toBe("Acme");
      expect(result.jobDetails.location).toBe("Remote");
      expect(result.jobDetails.skills).toEqual(["TypeScript"]);
      expect(result.jobDetails.description).toBe("Build stuff");
    }
  });

  it("not-a-job-posting: returns isJobPosting false with reason", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(NOT_A_JOB_RESULT));

    const result = await runJobExtractor(mockService, "some blog post");

    expect(result.isJobPosting).toBe(false);
    if (!result.isJobPosting) {
      expect(typeof result.reason).toBe("string");
      expect(result.reason).toBe("This is a blog post");
    }
  });

  it("markdown fence stripping: parses JSON wrapped in ```json fences", async () => {
    const fenced = "```json\n" + JSON.stringify(VALID_JOB_RESULT) + "\n```";
    mockComplete.mockResolvedValue(fenced);

    const result = await runJobExtractor(mockService, "page content");

    expect(result.isJobPosting).toBe(true);
    if (result.isJobPosting) {
      expect(result.jobDetails.title).toBe("SWE");
    }
  });

  it("invalid JSON from LLM: rejects with SyntaxError", async () => {
    mockComplete.mockResolvedValue("not json at all");

    await expect(runJobExtractor(mockService, "page")).rejects.toThrow(
      SyntaxError,
    );
  });

  it("schema mismatch: rejects when shape is wrong", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ matchScore: 42 }));

    await expect(runJobExtractor(mockService, "page")).rejects.toThrow();
  });

  it("calls stripHtml and wraps input in <page_content> delimiters", async () => {
    mockComplete.mockResolvedValue(JSON.stringify(VALID_JOB_RESULT));

    await runJobExtractor(mockService, "<div><p>Hello</p></div>");

    const userPrompt = mockComplete.mock.calls[0]?.[1] as string;
    expect(userPrompt).not.toContain("<div>");
    expect(userPrompt).not.toContain("<p>");
    expect(userPrompt).not.toContain("</p>");
    expect(userPrompt).not.toContain("</div>");
    expect(userPrompt).toContain("<page_content>");
    expect(userPrompt).toContain("</page_content>");
    expect(userPrompt).toContain("Hello");
  });
});
