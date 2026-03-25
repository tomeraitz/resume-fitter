import { useRef } from 'react';
import { Check, X, Download, Loader2 } from 'lucide-react';
import { FileDropzone } from './FileDropzone';
import { FileUploaded } from './FileUploaded';
import { useProfileForm, MAX_WORK_HISTORY_LENGTH } from '../hooks/useProfileForm';
import { useDownloadHtml } from '../hooks/useDownloadHtml';
import type { UserProfile } from '../../../types/storage';

interface ProfilePanelProps {
  profile: UserProfile;
  onSave: () => void;
  onCancel: () => void;
}

const CHAR_WARNING_THRESHOLD = 0.8;

export function ProfilePanel({ profile, onSave, onCancel }: ProfilePanelProps) {
  const {
    workHistory,
    setWorkHistory,
    fileName,
    fileSize,
    rawFile,
    handleFileSelect,
    handleSave,
    isSaving,
    error,
    isValid,
  } = useProfileForm(profile);

  const {
    downloadHtml,
    isDownloading,
    error: downloadError,
  } = useDownloadHtml();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode =
    profile.cvTemplate.trim() !== '' || profile.professionalHistory.trim() !== '';
  const title = isEditMode ? 'Edit profile' : 'Profile setup';
  const showCharCounter =
    workHistory.length > MAX_WORK_HISTORY_LENGTH * CHAR_WARNING_THRESHOLD;
  const isSaveDisabled = !isValid || isSaving;

  const handleSaveClick = async () => {
    const succeeded = await handleSave();
    if (succeeded) onSave();
  };

  const handleChangeFile = () => {
    fileInputRef.current?.click();
  };

  const handleHiddenFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col gap-4 p-5">
      <h2 className="font-display text-lg text-surface-900">{title}</h2>

      {/* CV Template section */}
      <div className="flex flex-col gap-2">
        <label className="font-body text-sm font-semibold text-surface-700">
          CV Template
        </label>
        {fileName && fileSize !== null ? (
          <FileUploaded
            fileName={fileName}
            fileSize={fileSize}
            onChangeFile={handleChangeFile}
          />
        ) : (
          <FileDropzone onFileSelect={handleFileSelect} />
        )}
        {/* Hidden input for "Change" file flow */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx"
          onChange={handleHiddenFileChange}
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
        />
        {rawFile && rawFile.name.endsWith('.pdf') && (
          <button
            type="button"
            disabled={isDownloading}
            onClick={() => downloadHtml(rawFile)}
            className={`flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-surface-200 bg-white font-body text-xs font-medium text-surface-600 transition-colors hover:bg-surface-50 ${
              isDownloading ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            {isDownloading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {isDownloading ? 'Converting...' : 'Download HTML'}
          </button>
        )}
        {downloadError && (
          <p role="alert" className="font-body text-xs text-error-500">
            {downloadError}
          </p>
        )}
      </div>

      {/* Work History section */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="work-history"
          className="font-body text-sm font-semibold text-surface-700"
        >
          Work History
        </label>
        <textarea
          id="work-history"
          aria-label="Work history"
          value={workHistory}
          onChange={(e) => setWorkHistory(e.target.value)}
          maxLength={MAX_WORK_HISTORY_LENGTH}
          placeholder="Paste your work experience, skills, and achievements here..."
          className="rounded-md border border-surface-200 bg-white p-3 font-body text-xs text-surface-900 placeholder:text-surface-400 leading-relaxed resize-none h-[120px] w-full focus:outline-none focus:border-accent-400 focus:ring-1 focus:ring-accent-400/20"
        />
        <div className="flex items-center justify-between">
          {!isEditMode && (
            <span className="font-body text-[11px] text-surface-400">
              This helps the AI tailor your CV more accurately
            </span>
          )}
          {showCharCounter && (
            <span className="font-body text-[11px] text-surface-400 ml-auto">
              {workHistory.length} / {MAX_WORK_HISTORY_LENGTH}
            </span>
          )}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <p role="alert" className="font-body text-xs text-error-500">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={isSaveDisabled}
          onClick={handleSaveClick}
          className={`flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent-400 font-body text-base font-semibold text-white shadow-button shadow-[0_0_12px_rgba(245,166,35,0.12)] transition-colors hover:bg-accent-500 active:bg-accent-600 ${
            isSaveDisabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          <Check size={16} />
          Save Profile
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-surface-200 bg-surface-100 font-body text-sm font-medium text-surface-600 transition-colors hover:bg-surface-200"
        >
          <X size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}
