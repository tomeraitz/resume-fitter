interface RunPipelineMessage {
  type: 'run-pipeline';
  jobDescription: string;
  jobTitle?: string;
  jobCompany?: string;
}

interface CancelPipelineMessage {
  type: 'cancel-pipeline';
}

interface ExtractJobMessage {
  type: 'extract-job';
}

type ExtensionMessage =
  | RunPipelineMessage
  | CancelPipelineMessage
  | ExtractJobMessage;

export type {
  RunPipelineMessage,
  CancelPipelineMessage,
  ExtractJobMessage,
  ExtensionMessage,
};
