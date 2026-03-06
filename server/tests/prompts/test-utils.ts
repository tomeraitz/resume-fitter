import { ModelService } from '../../src/services/model.service.js';
import { runHiringManager } from '../../src/agents/hiring-manager.js';
import { runRewriteResume } from '../../src/agents/rewrite-resume.js';
import { runAtsScanner } from '../../src/agents/ats-scanner.js';
import { runVerifier } from '../../src/agents/verifier.js';

const modelService = new ModelService();

type AgentName = 'hiring-manager' | 'rewrite-resume' | 'ats-scanner' | 'verifier';

const agentMap: Record<AgentName, (inputs: Record<string, unknown>) => Promise<unknown>> = {
  'hiring-manager': (inputs) =>
    runHiringManager(
      modelService,
      inputs['jobDescription'] as string,
      inputs['cvTemplate'] as string,
      inputs['history'] as string | undefined,
    ),
  'rewrite-resume': (inputs) =>
    runRewriteResume(
      modelService,
      inputs['missingKeywords'] as string[],
      inputs['cvTemplate'] as string,
      inputs['cvLanguage'] as string,
    ),
  'ats-scanner': (inputs) =>
    runAtsScanner(modelService, inputs['updatedCvHtml'] as string),
  'verifier': (inputs) =>
    runVerifier(
      modelService,
      inputs['updatedCvHtml'] as string,
      inputs['history'] as string | undefined,
    ),
};

export async function runAgent(agentName: AgentName, inputs: Record<string, unknown>): Promise<unknown> {
  return agentMap[agentName](inputs);
}
