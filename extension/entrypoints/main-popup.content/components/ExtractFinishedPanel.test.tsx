import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExtractFinishedPanel } from './ExtractFinishedPanel';
import type { ExtractedJobDetails } from '../../../types/extract';

function createJob(overrides: Partial<ExtractedJobDetails> = {}): ExtractedJobDetails {
  return {
    title: 'Senior Frontend Engineer',
    company: 'Acme Corp',
    location: 'Remote',
    skills: ['React', 'TypeScript', 'Node.js'],
    description: 'A great role building UI.',
    ...overrides,
  };
}

describe('ExtractFinishedPanel', () => {
  const defaultProps = {
    job: createJob(),
    onFitCv: vi.fn(),
    onExtractAgain: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders success title "Job details extracted"', () => {
    render(<ExtractFinishedPanel {...defaultProps} />);
    expect(screen.getByText('Job details extracted')).toBeInTheDocument();
  });

  it('renders all 4 detail rows with correct labels', () => {
    render(<ExtractFinishedPanel {...defaultProps} />);
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('skills overflow shows "+4" for 7 skills', () => {
    const job = createJob({
      skills: ['React', 'TypeScript', 'Node.js', 'GraphQL', 'AWS', 'Docker', 'Kubernetes'],
    });
    render(<ExtractFinishedPanel {...defaultProps} job={job} />);
    expect(screen.getByText('React, TypeScript, Node.js +4')).toBeInTheDocument();
  });

  it('"Fit My CV" button calls onFitCv', async () => {
    const onFitCv = vi.fn();
    render(<ExtractFinishedPanel {...defaultProps} onFitCv={onFitCv} />);

    await userEvent.click(screen.getByRole('button', { name: /fit my cv/i }));
    expect(onFitCv).toHaveBeenCalledOnce();
  });

  it('"Extract Again" button calls onExtractAgain', async () => {
    const onExtractAgain = vi.fn();
    render(<ExtractFinishedPanel {...defaultProps} onExtractAgain={onExtractAgain} />);

    await userEvent.click(
      screen.getByRole('button', { name: /extract again/i }),
    );
    expect(onExtractAgain).toHaveBeenCalledOnce();
  });

  it('handles empty skills array gracefully', () => {
    const job = createJob({ skills: [] });
    render(<ExtractFinishedPanel {...defaultProps} job={job} />);
    // Skills label is present but value is empty string
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });
});
