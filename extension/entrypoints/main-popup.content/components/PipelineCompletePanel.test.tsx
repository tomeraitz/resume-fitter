import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PipelineCompletePanel } from './PipelineCompletePanel';
import type { PipelineResults } from '../../../types/pipeline';

const mockResults: PipelineResults = {
  atsScore: 85,
  matchScore: 72,
  flaggedClaims: ['Claim 1', 'Claim 2'],
  finalCv: '<html>...</html>',
};

describe('PipelineCompletePanel', () => {
  const defaultProps = {
    results: mockResults,
    onReviewCv: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders success title "CV tailored successfully"', () => {
    render(<PipelineCompletePanel {...defaultProps} />);
    expect(screen.getByText('CV tailored successfully')).toBeInTheDocument();
  });

  it('renders ATS score badge with correct value', () => {
    render(<PipelineCompletePanel {...defaultProps} />);
    expect(screen.getByText('ATS: 85')).toBeInTheDocument();
  });

  it('renders Match score badge with correct value', () => {
    render(<PipelineCompletePanel {...defaultProps} />);
    expect(screen.getByText('Match: 72%')).toBeInTheDocument();
  });

  it('renders flags count badge', () => {
    render(<PipelineCompletePanel {...defaultProps} />);
    expect(screen.getByText('2 flags')).toBeInTheDocument();
  });

  it('"Review CV" button calls onReviewCv', async () => {
    const onReviewCv = vi.fn();
    render(<PipelineCompletePanel {...defaultProps} onReviewCv={onReviewCv} />);

    await userEvent.click(screen.getByRole('button', { name: /review cv/i }));
    expect(onReviewCv).toHaveBeenCalledOnce();
  });

  it('"Cancel" button calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<PipelineCompletePanel {...defaultProps} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('handles 0 flags correctly', () => {
    const results: PipelineResults = {
      ...mockResults,
      flaggedClaims: [],
    };
    render(<PipelineCompletePanel {...defaultProps} results={results} />);
    expect(screen.getByText('0 flags')).toBeInTheDocument();
  });
});
