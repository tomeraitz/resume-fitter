import { ScanSearch, X } from 'lucide-react';

interface ExtractLoadingPanelProps {
  onCancel: () => void;
}

export function ExtractLoadingPanel({ onCancel }: ExtractLoadingPanelProps) {
  return (
    <div className="flex flex-col items-center gap-5 p-5">
      {/* Pulsing concentric-circle icon */}
      <div
        className="relative h-[72px] w-[72px] animate-pulse-soft"
        aria-hidden="true"
      >
        <div className="absolute inset-0 rounded-full bg-accent-50 shadow-glow" />
        <div className="absolute inset-2 rounded-full bg-accent-100" />
        <div className="absolute inset-4 flex items-center justify-center rounded-full bg-accent-400">
          <ScanSearch size={20} strokeWidth={1.5} className="text-white" />
        </div>
      </div>

      {/* Text group */}
      <div className="flex flex-col items-center gap-1">
        <h2
          className="text-center font-display text-xl text-surface-900"
          aria-live="polite"
        >
          Extracting job details
        </h2>
        <p className="max-w-[280px] text-center font-body text-sm leading-relaxed text-surface-500">
          Scanning the current page for job information...
        </p>
      </div>

      {/* Progress bar */}
      <div
        className="h-1 w-full overflow-hidden rounded-full bg-surface-200"
        role="progressbar"
        aria-label="Extraction in progress"
      >
        <div className="h-full w-2/5 rounded-full bg-accent-400 animate-progress" />
      </div>

      {/* Cancel button */}
      <button
        type="button"
        onClick={onCancel}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded border border-surface-200 bg-surface-100 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
      >
        <X size={14} strokeWidth={1.5} />
        Cancel
      </button>
    </div>
  );
}
