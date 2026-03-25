import type { ExtractedJobDetails } from './extract';

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
  html: string;
}

interface OpenCvPreviewMessage {
  type: 'open-cv-preview';
}

interface ConvertPdfMessage {
  type: 'convert-pdf';
  pdfBase64: string;
  fileName: string;
}

type ConvertPdfResponse =
  | { success: true; html: string }
  | { success: false; error: string };

type ExtractJobResponse =
  | { success: true; job: ExtractedJobDetails }
  | { success: false; error: string; notJobPage?: boolean };

type ExtensionMessage =
  | RunPipelineMessage
  | CancelPipelineMessage
  | ExtractJobMessage
  | OpenCvPreviewMessage
  | ConvertPdfMessage;

export type {
  RunPipelineMessage,
  CancelPipelineMessage,
  ExtractJobMessage,
  OpenCvPreviewMessage,
  ConvertPdfMessage,
  ConvertPdfResponse,
  ExtractJobResponse,
  ExtensionMessage,
};
