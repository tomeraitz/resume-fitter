import { X } from 'lucide-react';
import { LogoIcon } from '../../../../components/icons/LogoIcon';

interface PopupHeaderProps {
  onClose: () => void;
}

export function PopupHeader({ onClose }: PopupHeaderProps) {
  return (
    <header className="flex items-center justify-between border-b border-surface-200 px-4 py-3">
      <div className="flex items-center gap-2.5">
        <LogoIcon size={24} />
        <h1 className="font-display text-lg text-surface-800">
          Resume Fitter
        </h1>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close popup"
        className="flex h-7 w-7 items-center justify-center rounded-md text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600"
      >
        <X size={16} strokeWidth={1.5} />
      </button>
    </header>
  );
}
