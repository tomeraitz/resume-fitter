import type { ReactNode } from 'react';
import { PopupHeader } from './PopupHeader';
import { PopupFooter } from './PopupFooter';

export type PopupStatus = 'connected' | 'incomplete' | 'complete' | 'error' | 'extracting' | 'ready' | 'pipeline' | 'pipeline-done';

interface MainPopupProps {
  status: PopupStatus;
  pipelineStep?: number;
  onClose: () => void;
  children: ReactNode;
}

export function MainPopup({ status, pipelineStep, onClose, children }: MainPopupProps) {
  return (
    <div
      role="dialog"
      aria-label="Resume Fitter"
      className="fixed right-4 z-[2147483640] flex flex-col rounded-lg bg-surface-50 shadow-overlay animate-slide-up font-body"
    >
      <PopupHeader onClose={onClose} />
      <div className="flex-1">{children}</div>
      <PopupFooter status={status} pipelineStep={pipelineStep} />
    </div>
  );
}
