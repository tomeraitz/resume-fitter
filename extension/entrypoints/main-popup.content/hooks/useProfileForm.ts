import { useState } from 'react';
import { userProfile } from '../../../services/storage';
import type { UserProfile } from '../../../types/storage';

const ACCEPTED_TYPES = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]);

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

const MAX_WORK_HISTORY_LENGTH = 5000;

const FILE_SIGNATURES: Record<string, number[]> = {
  '.pdf': [0x25, 0x50, 0x44, 0x46],
  '.docx': [0x50, 0x4b, 0x03, 0x04],
};

function getFileExtension(fileName: string): string | null {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot < 1) return null;
  return fileName.slice(lastDot).toLowerCase();
}

function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  if (!ext || !ACCEPTED_TYPES.has(ext) || file.type !== ACCEPTED_TYPES.get(ext)) {
    return 'Please upload a PDF or DOCX file.';
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

function readFileAs<T extends 'arraybuffer' | 'dataurl'>(
  file: File,
  mode: T,
): Promise<T extends 'arraybuffer' ? ArrayBuffer : string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as T extends 'arraybuffer' ? ArrayBuffer : string);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    if (mode === 'arraybuffer') {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsDataURL(file);
    }
  });
}

interface UseProfileFormReturn {
  workHistory: string;
  setWorkHistory: (value: string) => void;
  fileName: string | null;
  fileSize: number | null;
  handleFileSelect: (file: File) => Promise<void>;
  handleSave: () => Promise<boolean>;
  isSaving: boolean;
  error: string | null;
  isValid: boolean;
}

export function useProfileForm(profile: UserProfile): UseProfileFormReturn {
  const [workHistory, setWorkHistory] = useState(profile.professionalHistory);
  const [cvContent, setCvContent] = useState(profile.cvTemplate);
  const [fileName, setFileName] = useState<string | null>(profile.cvFileName ?? null);
  const [fileSize, setFileSize] = useState<number | null>(profile.cvFileSize ?? null);
  const [isSaving, setIsSaving] = useState(false);
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
      const buffer = await readFileAs(file, 'arraybuffer');
      if (!validateFileContent(buffer, ext)) {
        setError('File appears to be corrupted or is not a valid PDF/DOCX.');
        return;
      }
      const dataUrl = await readFileAs(file, 'dataurl');
      setCvContent(dataUrl);
      setFileName(file.name);
      setFileSize(file.size);
      setError(null);
    } catch {
      setError('Failed to read file.');
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
    handleFileSelect,
    handleSave,
    isSaving,
    error,
    isValid,
  };
}

export { MAX_WORK_HISTORY_LENGTH };
