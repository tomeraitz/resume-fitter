import type { ReactNode } from 'react';
import { PopupHeader } from './PopupHeader';
import { PopupFooter } from './PopupFooter';

export type PopupStatus = 'connected' | 'incomplete' | 'complete' | 'error';

interface MainPopupProps {
  status: PopupStatus;
  onClose: () => void;
  children: ReactNode;
}

export function MainPopup({ status, onClose, children }: MainPopupProps) {
  return (
    <div
      role="dialog"
      aria-label="Resume Fitter"
      className="fixed right-4 z-[2147483640] flex flex-col rounded-lg bg-surface-50 shadow-overlay animate-slide-up font-body"
    >
      <PopupHeader onClose={onClose} />
      <div className="flex-1">{children}</div>
      <PopupFooter status={status} />
    </div>
  );
}
