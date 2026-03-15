import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfilePanel } from './ProfilePanel';
import type { UserProfile } from '../../../types/storage';

// Mock the useProfileForm hook
const mockHandleSave = vi.fn();
const mockHandleFileSelect = vi.fn();
const mockSetWorkHistory = vi.fn();

const defaultHookReturn = {
  workHistory: '',
  setWorkHistory: mockSetWorkHistory,
  fileName: null as string | null,
  fileSize: null as number | null,
  handleFileSelect: mockHandleFileSelect,
  handleSave: mockHandleSave,
  isSaving: false,
  error: null as string | null,
  isValid: false,
};

vi.mock('../hooks/useProfileForm', () => ({
  useProfileForm: () => defaultHookReturn,
  MAX_WORK_HISTORY_LENGTH: 5000,
}));

function createProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    cvTemplate: '',
    professionalHistory: '',
    ...overrides,
  };
}

describe('ProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandleSave.mockResolvedValue(true);
    // Reset hook return to defaults
    Object.assign(defaultHookReturn, {
      workHistory: '',
      fileName: null,
      fileSize: null,
      isSaving: false,
      error: null,
      isValid: false,
    });
  });

  it('renders "Profile setup" title for empty profile', () => {
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('Profile setup')).toBeInTheDocument();
  });

  it('renders "Edit profile" title for filled profile', () => {
    render(
      <ProfilePanel
        profile={createProfile({
          cvTemplate: 'data:abc',
          professionalHistory: 'History',
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('Edit profile')).toBeInTheDocument();
  });

  it('shows FileDropzone when no file is selected', () => {
    defaultHookReturn.fileName = null;
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: 'Upload CV file' }),
    ).toBeInTheDocument();
  });

  it('shows FileUploaded when file is selected', () => {
    defaultHookReturn.fileName = 'cv.pdf';
    defaultHookReturn.fileSize = 1000;
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('cv.pdf')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('renders "CV Template" and "Work History" labels', () => {
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText('CV Template')).toBeInTheDocument();
    expect(screen.getByText('Work History')).toBeInTheDocument();
  });

  it('textarea reflects workHistory value from hook', () => {
    defaultHookReturn.workHistory = 'my history';
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const textarea = screen.getByLabelText('Work history') as HTMLTextAreaElement;
    expect(textarea.value).toBe('my history');
  });

  it('textarea onChange calls setWorkHistory', () => {
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const textarea = screen.getByLabelText('Work history');
    fireEvent.change(textarea, { target: { value: 'new value' } });
    expect(mockSetWorkHistory).toHaveBeenCalledWith('new value');
  });

  it('Save button is disabled when isValid is false', () => {
    defaultHookReturn.isValid = false;
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button is enabled when isValid is true', () => {
    defaultHookReturn.isValid = true;
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it('Save button is disabled when isSaving is true', () => {
    defaultHookReturn.isValid = true;
    defaultHookReturn.isSaving = true;
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    expect(saveBtn).toBeDisabled();
  });

  it('clicking Save calls handleSave, then onSave only on success', async () => {
    defaultHookReturn.isValid = true;
    mockHandleSave.mockResolvedValue(true);
    const onSave = vi.fn();
    render(
      <ProfilePanel profile={createProfile()} onSave={onSave} onCancel={vi.fn()} />,
    );
    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockHandleSave).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenCalledOnce();
    });
  });

  it('clicking Save does NOT call onSave when handleSave returns false', async () => {
    defaultHookReturn.isValid = true;
    mockHandleSave.mockResolvedValue(false);
    const onSave = vi.fn();
    render(
      <ProfilePanel profile={createProfile()} onSave={onSave} onCancel={vi.fn()} />,
    );
    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockHandleSave).toHaveBeenCalledOnce();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it('clicking Cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('displays error message from hook', () => {
    defaultHookReturn.error = 'Something went wrong';
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
  });

  it('helper text shown in setup mode only', () => {
    // Empty profile = setup mode
    const { unmount } = render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(
      screen.getByText('This helps the AI tailor your CV more accurately'),
    ).toBeInTheDocument();
    unmount();

    // Filled profile = edit mode
    render(
      <ProfilePanel
        profile={createProfile({
          cvTemplate: 'data:abc',
          professionalHistory: 'History',
        })}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.queryByText('This helps the AI tailor your CV more accurately'),
    ).not.toBeInTheDocument();
  });

  it('Save button shows disabled styling', () => {
    defaultHookReturn.isValid = false;
    render(
      <ProfilePanel profile={createProfile()} onSave={vi.fn()} onCancel={vi.fn()} />,
    );
    const saveBtn = screen.getByRole('button', { name: /save profile/i });
    expect(saveBtn.className).toContain('opacity-50');
    expect(saveBtn.className).toContain('cursor-not-allowed');
  });
});
