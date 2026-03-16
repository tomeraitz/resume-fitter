// Register the pdfjs worker on the main thread so pdfjs-dist skips
// spawning a Web Worker (which extension CSP blocks).
// This file must be imported before pdfjs-dist.
// @ts-expect-error — no type declarations for worker module
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';

(globalThis as Record<string, unknown>).pdfjsWorker = { WorkerMessageHandler };

// Re-export pdfjs-dist so consumers get it after worker registration
export * as pdfjsLib from 'pdfjs-dist';
