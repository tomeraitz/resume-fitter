import { Download, ShieldCheck, Target, X } from 'lucide-react';
import { LogoIcon } from '../../../components/icons/LogoIcon';

interface PreviewTopBarProps {
  jobTitle: string;
  atsScore: number;
  matchScore: number;
  onDownload: () => void;
  onCancel: () => void;
}

export function PreviewTopBar({
  jobTitle,
  atsScore,
  matchScore,
  onDownload,
  onCancel,
}: PreviewTopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-surface-200 bg-white px-5">
      {/* Left: Logo + title + separator + job title */}
      <div className="flex items-center gap-3">
        <LogoIcon size={32} />
        <span className="font-display text-xl text-surface-900">
          Resume Fitter
        </span>
        <div className="h-6 w-px bg-surface-200" aria-hidden="true" />
        <span className="font-body text-sm text-surface-500">{jobTitle}</span>
      </div>

      {/* Right: Badges + buttons */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1">
          <ShieldCheck size={14} className="text-success-700" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-success-700">
            ATS: {atsScore}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-1">
          <Target size={14} className="text-accent-700" aria-hidden="true" />
          <span className="font-body text-xs font-semibold text-accent-700">
            Match: {matchScore}%
          </span>
        </div>

        <button
          type="button"
          onClick={onDownload}
          className="ml-1 flex h-9 items-center gap-1.5 rounded bg-surface-900 px-3.5 font-body text-sm font-semibold text-white shadow-button transition-colors hover:bg-surface-800 active:bg-surface-700"
        >
          <Download size={14} strokeWidth={2} />
          Download
        </button>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel and close"
          className="flex h-9 items-center gap-1.5 rounded border border-surface-200 bg-surface-100 px-3 font-body text-sm font-semibold text-surface-600 transition-colors hover:bg-surface-200"
        >
          <X size={14} strokeWidth={2} />
          Cancel
        </button>
      </div>
    </header>
  );
}
