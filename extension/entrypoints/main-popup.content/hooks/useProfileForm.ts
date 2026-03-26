import { useState } from 'react';
import { userProfile } from '../../../services/storage';
import type { UserProfile } from '../../../types/storage';
import type { ConvertPdfResponse } from '../../../types/messages';
import { fileToBase64 } from '../utils/fileToBase64';

const ACCEPTED_TYPES = new Map([
  ['.pdf', 'application/pdf'],
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const MAX_WORK_HISTORY_LENGTH = 5000;

const FILE_SIGNATURES: Record<string, number[]> = {
  '.pdf': [0x25, 0x50, 0x44, 0x46],
};

function getFileExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 1) return null;
  return fileName.slice(lastDot).toLowerCase();
}

function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  if (!ext || !ACCEPTED_TYPES.has(ext) || file.type !== ACCEPTED_TYPES.get(ext)) {
    return 'Please upload a PDF file.';
  }
  if (file.size === 0) {
    return 'File is empty.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'File size must be under 2MB.';
  }
  return null;
}

function validateFileContent(buffer: ArrayBuffer, ext: string): boolean {
  const signature = FILE_SIGNATURES[ext];
  if (!signature) return false;
  const header = new Uint8Array(buffer.slice(0, signature.length));
  return signature.every((byte, i) => header[i] === byte);
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsArrayBuffer(file);
  });
}

interface UseProfileFormReturn {
  workHistory: string;
  setWorkHistory: (value: string) => void;
  fileName: string | null;
  fileSize: number | null;
  rawFile: File | null;
  handleFileSelect: (file: File) => Promise<void>;
  handleSave: () => Promise<boolean>;
  isSaving: boolean;
  isConverting: boolean;
  error: string | null;
  isValid: boolean;
}

export function useProfileForm(profile: UserProfile): UseProfileFormReturn {
  const [workHistory, setWorkHistory] = useState(profile.professionalHistory);
  const [cvContent, setCvContent] = useState(profile.cvTemplate);
  const [fileName, setFileName] = useState<string | null>(profile.cvFileName ?? null);
  const [fileSize, setFileSize] = useState<number | null>(profile.cvFileSize ?? null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid =
    cvContent.trim() !== '' &&
    workHistory.trim() !== '' &&
    workHistory.length <= MAX_WORK_HISTORY_LENGTH;

  const handleFileSelect = async (file: File): Promise<void> => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    const ext = getFileExtension(file.name)!;

    try {
      const buffer = await readFileAsArrayBuffer(file);
      if (!validateFileContent(buffer, ext)) {
        setError('File appears to be corrupted or is not a valid PDF.');
        return;
      }
    } catch {
      setError('Failed to read file.');
      return;
    }

    setIsConverting(true);
    try {
      const pdfBase64 = await fileToBase64(file);
      const raw: unknown = await browser.runtime.sendMessage({
        type: 'convert-pdf',
        pdfBase64,
        fileName: file.name,
      });
      if (typeof raw !== 'object' || raw === null || !('success' in raw)) {
        setError('Unexpected response from background script.');
        return;
      }
      const response = raw as ConvertPdfResponse;
      if (!response.success) {
        setError(response.error);
        return;
      }
      const html = response.html;
      if (!html.trim()) {
        setError('Could not extract content from file.');
        return;
      }
      setCvContent(html);
      setFileName(file.name);
      setFileSize(file.size);
      setRawFile(file);
      setError(null);

      // Open converted HTML in new tab for visual verification
      const safeHtml = `<!DOCTYPE html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:;"></head><body>${html}</body></html>`;
      const blob = new Blob([safeHtml], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
      setError('Cannot reach server.');
    } finally {
      setIsConverting(false);
    }
  };

  const handleSave = async (): Promise<boolean> => {
    if (!isValid) return false;
    setIsSaving(true);
    try {
      await userProfile.setValue({
        ...profile,
        cvTemplate: cvContent,
        professionalHistory: workHistory,
        cvFileName: fileName ?? undefined,
        cvFileSize: fileSize ?? undefined,
      });
      return true;
    } catch {
      setError('Failed to save profile. Please try again.');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    workHistory,
    setWorkHistory,
    fileName,
    fileSize,
    rawFile,
    handleFileSelect,
    handleSave,
    isSaving,
    isConverting,
    error,
    isValid,
  };
}

export { MAX_WORK_HISTORY_LENGTH };
