// Register the pdfjs worker on the main thread so pdfjs-dist skips
// spawning a Web Worker (which extension CSP blocks).
// This file must be imported before any pdfjs-dist usage.
// @ts-expect-error — no type declarations for worker module
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';

(globalThis as Record<string, unknown>).pdfjsWorker = { WorkerMessageHandler };

// Re-export pdfjs-dist so consumers get it after worker registration
export * as pdfjsLib from 'pdfjs-dist';

// Suppress the one-time "Setting up fake worker." console.warn that
// pdfjs-dist emits in non-Node environments even when the main-thread
// handler is correctly registered. We patch console.warn to filter it.
const _origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Setting up fake worker')) return;
  _origWarn.apply(console, args);
};
