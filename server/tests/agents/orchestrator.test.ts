import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("../../src/agents/hiring-manager.js", () => ({
  runHiringManager: vi.fn(),
}));
vi.mock("../../src/agents/rewrite-resume.js", () => ({
  runRewriteResume: vi.fn(),
}));
vi.mock("../../src/agents/ats-scanner.js", () => ({
  runAtsScanner: vi.fn(),
}));
vi.mock("../../src/agents/verifier.js", () => ({
  runVerifier: vi.fn(),
}));
// ModelService is constructed at orchestrator module load — mock it as a real
// constructor function so `new ModelService()` doesn't throw.
vi.mock("../../src/services/model.service.js", () => ({
  ModelService: vi.fn(function () {
    return { complete: vi.fn() };
  }),
}));

// Import mocks and the subject AFTER vi.mock hoisting
const { runHiringManager } = await import("../../src/agents/hiring-manager.js");
const { runRewriteResume } = await import("../../src/agents/rewrite-resume.js");
const { runAtsScanner } = await import("../../src/agents/ats-scanner.js");
const { runVerifier } = await import("../../src/agents/verifier.js");
const { runPipeline } = await import("../../src/agents/orchestrator.js");

const mockHM = vi.mocked(runHiringManager);
const mockRR = vi.mocked(runRewriteResume);
const mockATS = vi.mocked(runAtsScanner);
const mockV = vi.mocked(runVerifier);

const hmResult = {
  matchScore: 80,
  cvLanguage: "en",
  missingKeywords: ["docker"],
  summary: "Good match",
};
const rrResult = {
  updatedCvHtml: "<p>updated</p>",
  keywordsNotAdded: [],
};
const atsResult = {
  atsScore: 88,
  problemAreas: [],
  updatedCvHtml: "<p>ats-fixed</p>",
};
const verifierResult = {
  verifiedCv: "<p>verified</p>",
  flaggedClaims: [],
};

const request = {
  jobDescription: "jd",
  cvTemplate: "<p>cv</p>",
};

beforeEach(() => {
  mockHM.mockReset();
  mockRR.mockReset();
  mockATS.mockReset();
  mockV.mockReset();
});

describe("runPipeline", () => {
  it("all agents succeed: returns 4 steps with correct numbers and finalCv", async () => {
    mockHM.mockResolvedValue(hmResult);
    mockRR.mockResolvedValue(rrResult);
    mockATS.mockResolvedValue(atsResult);
    mockV.mockResolvedValue(verifierResult);

    const result = await runPipeline(request);

    expect(result.steps).toHaveLength(4);
    expect(result.steps[0]?.step).toBe(1);
    expect(result.steps[1]?.step).toBe(2);
    expect(result.steps[2]?.step).toBe(3);
    expect(result.steps[3]?.step).toBe(4);
    result.steps.forEach((s) => expect(s.durationMs).toBeGreaterThanOrEqual(0));
    expect(result.finalCv).toBe(verifierResult.verifiedCv);
  });

  it("verifier receives atsScannerResult.updatedCvHtml, not rewriteResumeResult.updatedCvHtml", async () => {
    mockHM.mockResolvedValue(hmResult);
    mockRR.mockResolvedValue(rrResult);
    mockATS.mockResolvedValue(atsResult);
    mockV.mockResolvedValue(verifierResult);

    await runPipeline(request);

    // Second arg to runVerifier must be ats-fixed html, NOT the rewrite-resume html
    const verifierCallArgs = mockV.mock.calls[0];
    expect(verifierCallArgs?.[1]).toBe("<p>ats-fixed</p>");
    expect(verifierCallArgs?.[1]).not.toBe("<p>updated</p>");
  });

  it("onStepComplete is called once per step", async () => {
    mockHM.mockResolvedValue(hmResult);
    mockRR.mockResolvedValue(rrResult);
    mockATS.mockResolvedValue(atsResult);
    mockV.mockResolvedValue(verifierResult);

    const onStepComplete = vi.fn();
    await runPipeline(request, onStepComplete);

    expect(onStepComplete).toHaveBeenCalledTimes(4);
    expect(onStepComplete.mock.calls[0]?.[0].step).toBe(1);
    expect(onStepComplete.mock.calls[1]?.[0].step).toBe(2);
    expect(onStepComplete.mock.calls[2]?.[0].step).toBe(3);
    expect(onStepComplete.mock.calls[3]?.[0].step).toBe(4);
  });

  it("runHiringManager throws: runPipeline rejects", async () => {
    mockHM.mockRejectedValue(new Error("hm failed"));

    await expect(runPipeline(request)).rejects.toThrow("hm failed");
  });

  it("runRewriteResume throws: runPipeline rejects", async () => {
    mockHM.mockResolvedValue(hmResult);
    mockRR.mockRejectedValue(new Error("rr failed"));

    await expect(runPipeline(request)).rejects.toThrow("rr failed");
  });

  it("runAtsScanner throws: runPipeline rejects", async () => {
    mockHM.mockResolvedValue(hmResult);
    mockRR.mockResolvedValue(rrResult);
    mockATS.mockRejectedValue(new Error("ats failed"));

    await expect(runPipeline(request)).rejects.toThrow("ats failed");
  });
});
