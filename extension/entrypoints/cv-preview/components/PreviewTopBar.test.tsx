import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreviewTopBar } from './PreviewTopBar';

describe('PreviewTopBar', () => {
  const defaultProps = {
    jobTitle: 'Senior Frontend Engineer',
    atsScore: 87,
    matchScore: 92,
    onDownload: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the brand name "Resume Fitter"', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('Resume Fitter')).toBeInTheDocument();
  });

  it('renders the job title', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('Senior Frontend Engineer')).toBeInTheDocument();
  });

  it('renders ATS score badge', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('ATS: 87')).toBeInTheDocument();
  });

  it('renders Match score badge', () => {
    render(<PreviewTopBar {...defaultProps} />);
    expect(screen.getByText('Match: 92%')).toBeInTheDocument();
  });

  it('calls onDownload when Download button is clicked', async () => {
    render(<PreviewTopBar {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /download/i }));
    expect(defaultProps.onDownload).toHaveBeenCalledOnce();
  });

  it('calls onCancel when Cancel button is clicked', async () => {
    render(<PreviewTopBar {...defaultProps} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });
});
