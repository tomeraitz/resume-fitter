interface PopupFooterProps {
  status: 'connected' | 'incomplete' | 'complete' | 'error';
}

const STATUS_CONFIG = {
  connected: { color: 'bg-success-500', label: 'Connected' },
  incomplete: { color: 'bg-warning-500', label: 'Profile incomplete' },
  complete: { color: 'bg-success-500', label: 'Profile complete' },
  error: { color: 'bg-error-500', label: 'Error' },
} as const;

export function PopupFooter({ status }: PopupFooterProps) {
  const { color, label } = STATUS_CONFIG[status];
  const version = browser.runtime.getManifest().version;

  return (
    <footer className="flex items-center justify-between border-t border-surface-200 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 rounded-full ${color}`}
          aria-hidden="true"
        />
        <span
          className="text-2xs font-medium text-surface-500"
          aria-live="polite"
        >
          {label}
        </span>
      </div>
      <span className="text-2xs text-surface-400">v{version}</span>
    </footer>
  );
}
