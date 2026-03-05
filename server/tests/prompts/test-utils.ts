import { readFileSync } from 'fs';
import { join } from 'path';
import { ModelService } from '../../src/services/model.service.js';

const modelService = new ModelService();

export async function runAgent(agentName: string, inputs: Record<string, unknown>): Promise<unknown> {
  const systemPrompt = readFileSync(
    join(import.meta.dirname, `../../src/prompts/${agentName}.md`),
    'utf8',
  );
  const raw = await modelService.complete(systemPrompt, JSON.stringify(inputs));
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(text);
}
