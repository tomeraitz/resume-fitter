import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { runPipeline } from '../../src/agents/orchestrator.js';

const RUN = process.env.TEST_EVAL === 'true';
const describeIf = (cond: boolean) => (cond ? describe : describe.skip);

const fixtures = join(import.meta.dirname, '../fixtures');

const jobDescription = readFileSync(join(fixtures, 'job-descriptions/sre-role.txt'), 'utf8');
const cvTemplate = readFileSync(join(fixtures, 'cv-templates/single-column-cv.html'), 'utf8');
const history = readFileSync(join(fixtures, 'histories/candidate-history.md'), 'utf8');

describeIf(RUN)('orchestrator — end-to-end smoke test', () => {
  it('runs all 4 agents and returns a valid PipelineResponse', async () => {
    const result = await runPipeline({ jobDescription, cvTemplate, history });

    expect(result.steps).toHaveLength(4);
    expect(result.steps.every((s) => s.durationMs >= 0)).toBe(true);
    const [step0, step1, step2, step3] = result.steps;
    expect(step0!.name).toBe('hiring-manager');
    expect(step1!.name).toBe('rewrite-resume');
    expect(step2!.name).toBe('ats-scanner');
    expect(step3!.name).toBe('verifier');
    expect(typeof result.finalCv).toBe('string');
    expect(result.finalCv.length).toBeGreaterThan(0);
  });
});
