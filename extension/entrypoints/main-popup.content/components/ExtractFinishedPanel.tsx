import { Check, RefreshCw, Sparkles } from 'lucide-react';
import type { ExtractedJobDetails } from '@/types/extract';

interface ExtractFinishedPanelProps {
  job: ExtractedJobDetails;
  onFitCv: () => void;
  onExtractAgain: () => void;
}

function DetailRow({
  label,
  value,
  hasBorder = false,
}: {
  label: string;
  value: string;
  hasBorder?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-3.5 py-2.5 ${hasBorder ? 'border-b border-surface-100' : ''}`}
    >
      <span className="font-body text-[11px] font-semibold text-surface-400">
        {label}
      </span>
      <span className="font-body text-sm font-medium text-surface-900">
        {value}
      </span>
    </div>
  );
}

function formatSkills(skills: string[]): string {
  const MAX_VISIBLE = 3;
  if (skills.length <= MAX_VISIBLE) return skills.join(', ');
  return `${skills.slice(0, MAX_VISIBLE).join(', ')} +${skills.length - MAX_VISIBLE}`;
}

export function ExtractFinishedPanel({
  job,
  onFitCv,
  onExtractAgain,
}: ExtractFinishedPanelProps) {
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
          Job details extracted
        </h2>
        <p className="text-center font-body text-sm text-surface-500">
          Found the following from this page
        </p>
      </div>

      {/* Job details card */}
      <div className="w-full overflow-hidden rounded border border-surface-200 bg-white">
        <DetailRow label="Title" value={job.title} hasBorder />
        <DetailRow label="Company" value={job.company} hasBorder />
        <DetailRow label="Location" value={job.location} hasBorder />
        <DetailRow label="Skills" value={formatSkills(job.skills)} />
      </div>

      {/* Action buttons */}
      <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={onFitCv}
          className="flex h-11 w-full items-center justify-center gap-2 rounded bg-accent-400 font-body text-[15px] font-semibold text-white shadow-button shadow-[0_0_12px_rgba(245,166,35,0.12)] transition-colors hover:bg-accent-500 active:bg-accent-600"
        >
          <Sparkles size={18} strokeWidth={1.5} />
          Fit My CV
        </button>

        <button
          type="button"
          onClick={onExtractAgain}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded border border-surface-200 bg-surface-100 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
        >
          <RefreshCw size={14} strokeWidth={1.5} />
          Extract Again
        </button>
      </div>
    </div>
  );
}
