import { Check, X } from 'lucide-react';
import type { AgentResultData, AgentStep, StepStatus, StepsRecord } from '@/types/pipeline';

interface ProgressPanelProps {
  steps: StepsRecord;
  currentStepNumber: number;
  onCancel: () => void;
}

const STEP_CONFIG = [
  {
    key: 'hiring-manager' as AgentStep,
    label: 'Hiring Manager Review',
    activeDesc: 'Analyzing job requirements...',
    completedDesc: (data: AgentResultData) => {
      if (data.step !== 'hiring-manager') return '';
      return `Match score: ${data.matchScore} \u00b7 ${data.missingKeywords.length} missing keywords found`;
    },
  },
  {
    key: 'rewrite-resume' as AgentStep,
    label: 'Rewriting Resume',
    activeDesc: 'Incorporating keywords naturally...',
    completedDesc: () => 'Resume rewritten successfully',
  },
  {
    key: 'ats-scanner' as AgentStep,
    label: 'ATS Compatibility Scan',
    activeDesc: 'Scanning for ATS compatibility...',
    completedDesc: (data: AgentResultData) => {
      if (data.step !== 'ats-scanner') return '';
      return `ATS score: ${data.atsScore} \u00b7 ${data.problemAreas.length} issues found`;
    },
  },
  {
    key: 'verifier' as AgentStep,
    label: 'Accuracy Verification',
    activeDesc: 'Cross-checking claims...',
    completedDesc: (data: AgentResultData) => {
      if (data.step !== 'verifier') return '';
      return data.flaggedClaims.length === 0
        ? 'All claims verified'
        : `${data.flaggedClaims.length} claims flagged`;
    },
  },
] as const;

function StepIndicator({
  stepNumber,
  status,
  isLast,
}: {
  stepNumber: number;
  status: StepStatus;
  isLast: boolean;
}) {
  const dot = (() => {
    if (status === 'completed') {
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success-500">
          <Check size={12} strokeWidth={2.5} className="text-white" aria-hidden="true" />
        </div>
      );
    }
    if (status === 'running') {
      return (
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-400 shadow-[0_0_12px_rgba(245,166,35,0.25)]">
          <span className="font-body text-xs font-bold text-white" aria-hidden="true">
            {stepNumber}
          </span>
        </div>
      );
    }
    return (
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200">
        <span className="font-body text-xs font-medium text-surface-500" aria-hidden="true">
          {stepNumber}
        </span>
      </div>
    );
  })();

  return (
    <div className="flex w-6 flex-col items-center">
      {dot}
      {!isLast && (
        <div
          className={`w-0.5 flex-1 ${status === 'completed' ? 'bg-success-500' : 'bg-surface-200'}`}
        />
      )}
    </div>
  );
}

function getStepDescription(
  config: (typeof STEP_CONFIG)[number],
  status: StepStatus,
  data?: AgentResultData,
): string {
  if (status === 'completed' && data) {
    return config.completedDesc(data);
  }
  if (status === 'running') {
    return config.activeDesc;
  }
  return 'Waiting...';
}

export function ProgressPanel({
  steps,
  currentStepNumber,
  onCancel,
}: ProgressPanelProps) {
  return (
    <div className="flex w-full flex-col gap-5 p-5">
      {/* Progress Header */}
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-xl text-surface-900">
          Tailoring your CV
        </h2>
        <p className="font-body text-sm text-surface-500">
          Processing your CV through the pipeline...
        </p>
      </div>

      {/* Steps Timeline */}
      <div className="flex flex-col">
        {STEP_CONFIG.map((config, index) => {
          const stepNumber = index + 1;
          const result = steps[config.key];
          const status = result.status;
          const isLast = index === STEP_CONFIG.length - 1;
          const isActive = status === 'running';
          const description = getStepDescription(config, status, result.data);

          return (
            <div
              key={config.key}
              className="flex gap-3"
              aria-label={`Step ${stepNumber}: ${config.label} - ${status}`}
            >
              <StepIndicator
                stepNumber={stepNumber}
                status={status}
                isLast={isLast}
              />
              <div className="flex flex-col pb-4">
                <span
                  className={`text-sm ${
                    status === 'completed'
                      ? 'font-semibold text-surface-900'
                      : status === 'running'
                        ? 'font-semibold text-accent-700'
                        : 'font-medium text-surface-400'
                  }`}
                >
                  {config.label}
                </span>
                <span
                  className={`text-xs ${
                    status === 'completed'
                      ? 'text-success-700'
                      : status === 'running'
                        ? 'text-surface-500'
                        : 'text-surface-300'
                  }`}
                  {...(isActive ? { 'aria-live': 'polite' as const } : {})}
                >
                  {description}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cancel Button */}
      <button
        type="button"
        onClick={onCancel}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-surface-200 bg-surface-100 font-body text-sm text-surface-600 transition-colors hover:bg-surface-200"
      >
        <X size={14} strokeWidth={1.5} />
        Cancel
      </button>
    </div>
  );
}
