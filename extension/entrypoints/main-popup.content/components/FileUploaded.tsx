import { FileText } from 'lucide-react';

interface FileUploadedProps {
  fileName: string;
  fileSize: number;
  onChangeFile: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileUploaded({
  fileName,
  fileSize,
  onChangeFile,
}: FileUploadedProps) {
  return (
    <div className="flex items-center gap-2.5 h-12 w-full rounded-md border border-success-500/20 bg-success-50 px-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-sm bg-white">
        <FileText size={16} className="text-success-500" />
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="font-body text-xs font-medium text-surface-900 truncate">
          {fileName}
        </span>
        <span className="font-body text-2xs text-surface-400">
          {formatFileSize(fileSize)}
        </span>
      </div>
      <button
        type="button"
        onClick={onChangeFile}
        className="rounded-sm bg-surface-100 px-2 py-1 text-[11px] font-medium text-surface-600 hover:bg-surface-200 transition-colors"
      >
        Change
      </button>
    </div>
  );
}
