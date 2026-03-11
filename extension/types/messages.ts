interface RunPipelineMessage {
  type: 'run-pipeline';
  jobDescription: string;
  jobTitle?: string;
  jobCompany?: string;
}

interface CancelPipelineMessage {
  type: 'cancel-pipeline';
}

type ExtensionMessage = RunPipelineMessage | CancelPipelineMessage;

export type { RunPipelineMessage, CancelPipelineMessage, ExtensionMessage };
