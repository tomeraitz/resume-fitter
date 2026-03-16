import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExtractLoadingPanel } from './ExtractLoadingPanel';

describe('ExtractLoadingPanel', () => {
  const defaultProps = {
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title "Extracting job details"', () => {
    render(<ExtractLoadingPanel {...defaultProps} />);
    expect(screen.getByText('Extracting job details')).toBeInTheDocument();
  });

  it('renders subtitle "Scanning the current page for job information..."', () => {
    render(<ExtractLoadingPanel {...defaultProps} />);
    expect(
      screen.getByText('Scanning the current page for job information...'),
    ).toBeInTheDocument();
  });

  it('progress bar is present', () => {
    render(<ExtractLoadingPanel {...defaultProps} />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('Cancel button calls onCancel on click', async () => {
    const onCancel = vi.fn();
    render(<ExtractLoadingPanel onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('pulsing animation class animate-pulse-soft is present', () => {
    const { container } = render(<ExtractLoadingPanel {...defaultProps} />);
    const pulsingElement = container.querySelector('.animate-pulse-soft');
    expect(pulsingElement).toBeInTheDocument();
  });
});
