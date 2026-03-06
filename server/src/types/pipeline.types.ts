export interface AgentResult {
  step: 1 | 2 | 3 | 4;
  name: string;
  output: Record<string, unknown>;
  durationMs: number;
}

export interface PipelineRequest {
  jobDescription: string;
  cvTemplate: string;
  history?: string | undefined;
}

export interface PipelineResponse {
  steps: AgentResult[];
  /** Final CV HTML — sourced from verifier.verifiedCv */
  finalCv: string;
}
