import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InitialPanel } from './InitialPanel';

describe('InitialPanel', () => {
  const defaultProps = {
    hasProfile: false,
    isLoading: false,
    isJobPage: true,
    onExtractJob: vi.fn(),
    onEditProfile: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading skeleton when isLoading is true', () => {
    const { container } = render(
      <InitialPanel {...defaultProps} isLoading={true} />,
    );
    const pulsingElements = container.querySelectorAll('.animate-pulse-soft');
    expect(pulsingElements.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "Set up your profile" when hasProfile is false', () => {
    render(<InitialPanel {...defaultProps} hasProfile={false} />);
    expect(screen.getByText('Set up your profile')).toBeInTheDocument();
  });

  it('shows "Ready to tailor" when hasProfile is true', () => {
    render(<InitialPanel {...defaultProps} hasProfile={true} />);
    expect(screen.getByText('Ready to tailor')).toBeInTheDocument();
  });

  it('shows disabled "Extract Job" button when hasProfile is false', () => {
    render(<InitialPanel {...defaultProps} hasProfile={false} />);
    const extractButton = screen.getByRole('button', { name: /extract job/i });
    expect(extractButton).toBeDisabled();
  });

  it('does not call onExtractJob when disabled Extract Job button is clicked', async () => {
    const onExtractJob = vi.fn();
    render(
      <InitialPanel {...defaultProps} hasProfile={false} onExtractJob={onExtractJob} />,
    );

    const extractButton = screen.getByRole('button', { name: /extract job/i });
    await userEvent.click(extractButton);
    expect(onExtractJob).not.toHaveBeenCalled();
  });

  it('calls onExtractJob when extract button is clicked with profile', async () => {
    const onExtractJob = vi.fn();
    render(
      <InitialPanel {...defaultProps} hasProfile={true} onExtractJob={onExtractJob} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /extract job/i }),
    );
    expect(onExtractJob).toHaveBeenCalledOnce();
  });

  it('calls onEditProfile when "Edit Profile" text link is clicked (has profile)', async () => {
    const onEditProfile = vi.fn();
    render(
      <InitialPanel {...defaultProps} hasProfile={true} onEditProfile={onEditProfile} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /edit profile/i }),
    );
    expect(onEditProfile).toHaveBeenCalledOnce();
  });

  it('calls onEditProfile when "Edit Profile" primary button is clicked (no profile)', async () => {
    const onEditProfile = vi.fn();
    render(
      <InitialPanel {...defaultProps} hasProfile={false} onEditProfile={onEditProfile} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: /edit profile/i }),
    );
    expect(onEditProfile).toHaveBeenCalledOnce();
  });

  it('does not call any handler on initial render', () => {
    render(<InitialPanel {...defaultProps} />);
    expect(defaultProps.onExtractJob).not.toHaveBeenCalled();
    expect(defaultProps.onEditProfile).not.toHaveBeenCalled();
  });
});
