import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProfileForm } from './useProfileForm';
import {
  mockSetValue,
  createProfile,
  createMockFile,
  PDF_MAGIC,
} from './useProfileForm.test-utils';

vi.mock('../../../services/storage', () => ({
  userProfile: {
    setValue: (...args: unknown[]) => mockSetValue(...args),
  },
}));

vi.mock('../utils/fileToBase64', () => ({
  fileToBase64: vi.fn().mockResolvedValue('base64-pdf-data'),
}));

describe('useProfileForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetValue.mockResolvedValue(undefined);

    // Mock browser.runtime.sendMessage for convert-pdf calls
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          success: true,
          html: '<p>converted</p>',
        }),
      },
    });

    // Mock window.open (hook opens converted HTML in new tab)
    vi.stubGlobal('open', vi.fn());
  });

  describe('initialization', () => {
    it('initializes workHistory from profile.professionalHistory', () => {
      const { result } = renderHook(() =>
        useProfileForm(createProfile({ professionalHistory: 'My history' })),
      );
      expect(result.current.workHistory).toBe('My history');
    });

    it('initializes fileName from profile.cvFileName', () => {
      const { result } = renderHook(() =>
        useProfileForm(createProfile({ cvFileName: 'cv.pdf' })),
      );
      expect(result.current.fileName).toBe('cv.pdf');
    });

    it('initializes fileSize from profile.cvFileSize', () => {
      const { result } = renderHook(() =>
        useProfileForm(createProfile({ cvFileSize: 12345 })),
      );
      expect(result.current.fileSize).toBe(12345);
    });
  });

  describe('isValid', () => {
    it('is false when both fields empty', () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      expect(result.current.isValid).toBe(false);
    });

    it('is false when only CV is set', () => {
      const { result } = renderHook(() =>
        useProfileForm(createProfile({ cvTemplate: 'data:application/pdf;base64,abc' })),
      );
      expect(result.current.isValid).toBe(false);
    });

    it('is false when only work history is set', () => {
      const { result } = renderHook(() =>
        useProfileForm(createProfile({ professionalHistory: 'My history' })),
      );
      expect(result.current.isValid).toBe(false);
    });

    it('is true when both fields have content', () => {
      const { result } = renderHook(() =>
        useProfileForm(
          createProfile({
            cvTemplate: 'data:application/pdf;base64,abc',
            professionalHistory: 'My history',
          }),
        ),
      );
      expect(result.current.isValid).toBe(true);
    });

    it('is false when work history exceeds 5000 chars', () => {
      const profile = createProfile({
        cvTemplate: 'data:abc',
        professionalHistory: 'a'.repeat(5001),
      });
      const { result } = renderHook(() => useProfileForm(profile));
      expect(result.current.isValid).toBe(false);
    });
  });

  describe('setWorkHistory', () => {
    it('updates work history state', () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      act(() => {
        result.current.setWorkHistory('Updated history');
      });
      expect(result.current.workHistory).toBe('Updated history');
    });
  });

  describe('handleFileSelect', () => {
    it('with valid PDF sets file state', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      const file = createMockFile('resume.pdf', 'application/pdf', PDF_MAGIC);

      await act(async () => {
        await result.current.handleFileSelect(file);
      });

      expect(result.current.fileName).toBe('resume.pdf');
      expect(result.current.fileSize).toBe(file.size);
      expect(result.current.error).toBeNull();
    });

    it('with invalid type sets error', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      const file = createMockFile('notes.txt', 'text/plain');

      await act(async () => {
        await result.current.handleFileSelect(file);
      });

      expect(result.current.error).toBe('Please upload a PDF file.');
    });

    it('with oversized file sets error', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      const file = createMockFile('big.pdf', 'application/pdf', 3 * 1024 * 1024);

      await act(async () => {
        await result.current.handleFileSelect(file);
      });

      expect(result.current.error).toBe('File size must be under 2MB.');
    });

    it('clears previous error on valid file', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));

      await act(async () => {
        await result.current.handleFileSelect(createMockFile('notes.txt', 'text/plain'));
      });
      expect(result.current.error).toBe('Please upload a PDF file.');

      await act(async () => {
        await result.current.handleFileSelect(
          createMockFile('resume.pdf', 'application/pdf', PDF_MAGIC),
        );
      });

      expect(result.current.error).toBeNull();
    });

    it('with spoofed extension rejects file', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      const file = createMockFile('fake.pdf', 'text/plain');

      await act(async () => {
        await result.current.handleFileSelect(file);
      });

      expect(result.current.error).toBe('Please upload a PDF file.');
    });

    it('with invalid magic bytes rejects file', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      const badContent = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const file = createMockFile('resume.pdf', 'application/pdf', badContent);

      await act(async () => {
        await result.current.handleFileSelect(file);
      });

      expect(result.current.error).toBe(
        'File appears to be corrupted or is not a valid PDF.',
      );
    });

    it('rejects empty (0-byte) file', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));
      const file = new File([], 'empty.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.handleFileSelect(file);
      });

      expect(result.current.error).toBe('File is empty.');
    });
  });

  describe('handleSave', () => {
    it('calls userProfile.setValue with correct shape', async () => {
      const profile = createProfile({
        cvTemplate: 'data:application/pdf;base64,abc',
        professionalHistory: 'History',
        displayName: 'Tomer',
        cvFileName: 'cv.pdf',
        cvFileSize: 1000,
      });
      const { result } = renderHook(() => useProfileForm(profile));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockSetValue).toHaveBeenCalledWith({
        cvTemplate: 'data:application/pdf;base64,abc',
        professionalHistory: 'History',
        displayName: 'Tomer',
        cvFileName: 'cv.pdf',
        cvFileSize: 1000,
      });
    });

    it('sets isSaving during save', async () => {
      let resolveSave: (() => void) | undefined;
      mockSetValue.mockImplementation(
        () => new Promise<void>((resolve) => { resolveSave = resolve; }),
      );

      const profile = createProfile({
        cvTemplate: 'data:abc',
        professionalHistory: 'History',
      });
      const { result } = renderHook(() => useProfileForm(profile));

      let savePromise: Promise<boolean>;
      act(() => {
        savePromise = result.current.handleSave();
      });

      expect(result.current.isSaving).toBe(true);

      await act(async () => {
        resolveSave!();
        await savePromise!;
      });

      expect(result.current.isSaving).toBe(false);
    });

    it('resets isSaving after completion', async () => {
      const profile = createProfile({
        cvTemplate: 'data:abc',
        professionalHistory: 'History',
      });
      const { result } = renderHook(() => useProfileForm(profile));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(result.current.isSaving).toBe(false);
    });

    it('sets error on storage failure', async () => {
      mockSetValue.mockRejectedValue(new Error('Storage error'));

      const profile = createProfile({
        cvTemplate: 'data:abc',
        professionalHistory: 'History',
      });
      const { result } = renderHook(() => useProfileForm(profile));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(result.current.error).toBe('Failed to save profile. Please try again.');
    });

    it('does nothing when isValid is false', async () => {
      const { result } = renderHook(() => useProfileForm(createProfile()));

      await act(async () => {
        await result.current.handleSave();
      });

      expect(mockSetValue).not.toHaveBeenCalled();
    });

    it('returns true on success', async () => {
      const profile = createProfile({
        cvTemplate: 'data:abc',
        professionalHistory: 'History',
      });
      const { result } = renderHook(() => useProfileForm(profile));

      let returnValue: boolean = false;
      await act(async () => {
        returnValue = await result.current.handleSave();
      });

      expect(returnValue).toBe(true);
    });

    it('returns false on failure', async () => {
      mockSetValue.mockRejectedValue(new Error('Storage error'));

      const profile = createProfile({
        cvTemplate: 'data:abc',
        professionalHistory: 'History',
      });
      const { result } = renderHook(() => useProfileForm(profile));

      let returnValue: boolean = true;
      await act(async () => {
        returnValue = await result.current.handleSave();
      });

      expect(returnValue).toBe(false);
    });
  });
});
