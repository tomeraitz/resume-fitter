import { ScanSearch, CircleUserRound, Sparkles, UserPen } from 'lucide-react';

interface InitialPanelProps {
  hasProfile: boolean;
  isLoading: boolean;
  isJobPage: boolean;
  onExtractJob: () => void;
  onEditProfile: () => void;
}

export function InitialPanel({
  hasProfile,
  isLoading,
  isJobPage,
  onExtractJob,
  onEditProfile,
}: InitialPanelProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-4 p-5">
        <div className="h-12 w-12 animate-pulse-soft rounded-full bg-surface-200" />
        <div className="h-5 w-3/4 animate-pulse-soft rounded bg-surface-200" />
        <div className="h-10 w-[220px] animate-pulse-soft rounded bg-surface-200" />
      </div>
    );
  }

  if (hasProfile) {
    return (
      <div className="flex flex-col items-center gap-5 p-5 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-50">
          <ScanSearch size={24} strokeWidth={1.5} className="text-accent-500" />
        </div>

        <div>
          <h2 className="font-display text-lg text-surface-900">
            Ready to tailor
          </h2>
          <p className="mx-auto mt-1 max-w-[280px] font-body text-sm leading-relaxed text-surface-500">
            Extract the job description from this page to start the pipeline
          </p>
        </div>

        <button
          type="button"
          onClick={onExtractJob}
          disabled={!isJobPage}
          className={`flex h-10 w-[220px] items-center justify-center gap-2 rounded font-body text-base font-semibold transition-colors ${
            isJobPage
              ? 'bg-accent-400 text-white shadow-button hover:bg-accent-500 active:bg-accent-600'
              : 'bg-surface-200 text-surface-400 opacity-50 cursor-not-allowed'
          }`}
        >
          <Sparkles size={16} strokeWidth={1.5} />
          Extract Job
        </button>
        {!isJobPage && (
          <p className="text-xs text-surface-400 text-center">
            Navigate to a job posting to extract
          </p>
        )}

        <button
          type="button"
          onClick={onEditProfile}
          className="flex items-center gap-1 text-xs font-medium text-surface-400 transition-colors hover:text-surface-600"
        >
          <UserPen size={16} strokeWidth={1.5} />
          Edit Profile
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 p-5 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning-50">
        <CircleUserRound size={24} strokeWidth={1.5} className="text-warning-500" />
      </div>

      <div>
        <h2 className="font-display text-lg text-surface-900">
          Set up your profile
        </h2>
        <p className="mx-auto mt-1 max-w-[280px] font-body text-sm leading-relaxed text-surface-500">
          Add your CV template and work history to get started
        </p>
      </div>

      <button
        type="button"
        onClick={onEditProfile}
        className="flex h-10 w-[220px] items-center justify-center gap-2 rounded bg-accent-400 font-body text-base font-semibold text-white shadow-button transition-colors hover:bg-accent-500 active:bg-accent-600"
      >
        <UserPen size={16} strokeWidth={1.5} />
        Edit Profile
      </button>

      <button
        type="button"
        disabled
        className="flex h-10 w-[220px] cursor-not-allowed items-center justify-center gap-2 rounded bg-surface-200 font-body text-base font-semibold text-surface-400 opacity-60"
      >
        <Sparkles size={16} strokeWidth={1.5} />
        Extract Job
      </button>
    </div>
  );
}
