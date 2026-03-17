import { Check, Eye, Flag, ShieldCheck, Target, X } from 'lucide-react';
import type { PipelineResults } from '@/types/pipeline';

interface PipelineCompletePanelProps {
  results: PipelineResults;
  onReviewCv: () => void;
  onCancel: () => void;
}

export function PipelineCompletePanel({
  results,
  onReviewCv,
  onCancel,
}: PipelineCompletePanelProps) {
  return (
    <div className="flex flex-col items-center gap-5 p-5">
      {/* Success icon (2-ring) */}
      <div className="relative h-14 w-14" aria-hidden="true">
        <div className="absolute inset-0 rounded-full bg-success-50 shadow-[0_0_20px_rgba(34,197,94,0.09)]" />
        <div className="absolute inset-2 flex items-center justify-center rounded-full bg-success-500">
          <Check size={22} strokeWidth={2} className="text-white" />
        </div>
      </div>

      {/* Text group */}
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-center font-display text-xl text-surface-900">
          CV tailored successfully
        </h2>
        <p className="text-center font-body text-sm text-surface-500">
          All 4 pipeline steps completed
        </p>
      </div>

      {/* Score badges */}
      <div className="flex w-full items-center justify-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-success-50 px-3 py-1.5">
          <ShieldCheck size={14} className="text-success-700" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-success-700">
            ATS: {results.atsScore}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1.5">
          <Target size={14} className="text-accent-700" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-accent-700">
            Match: {results.matchScore}%
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-surface-100 px-3 py-1.5">
          <Flag size={14} className="text-surface-600" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-surface-600">
            {results.flaggedClaims.length} flags
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onReviewCv}
          className="flex h-11 w-full items-center justify-center gap-2 rounded bg-accent-400 font-body text-base font-semibold text-white shadow-button shadow-[0_0_12px_rgba(245,166,35,0.12)] transition-colors hover:bg-accent-500 active:bg-accent-600"
        >
          <Eye size={16} strokeWidth={1.5} />
          Review CV
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded border border-surface-200 bg-surface-100 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
        >
          <X size={14} strokeWidth={1.5} />
          Cancel
        </button>
      </div>
    </div>
  );
}
