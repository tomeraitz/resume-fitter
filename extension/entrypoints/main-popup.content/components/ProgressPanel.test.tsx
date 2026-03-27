import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProgressPanel } from './ProgressPanel';
import type { StepsRecord } from '@/types/pipeline';

function makeSteps(
  overrides: Partial<StepsRecord> = {},
): StepsRecord {
  return {
    'hiring-manager': {
      step: 'hiring-manager',
      status: 'pending',
    },
    'rewrite-resume': {
      step: 'rewrite-resume',
      status: 'pending',
    },
    'ats-scanner': {
      step: 'ats-scanner',
      status: 'pending',
    },
    verifier: {
      step: 'verifier',
      status: 'pending',
    },
    ...overrides,
  };
}

describe('ProgressPanel', () => {
  const defaultProps = {
    steps: makeSteps(),
    currentStepNumber: 1,
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 4 step labels', () => {
    render(<ProgressPanel {...defaultProps} />);

    expect(screen.getByText('Hiring Manager Review')).toBeInTheDocument();
    expect(screen.getByText('Rewriting Resume')).toBeInTheDocument();
    expect(screen.getByText('ATS Compatibility Scan')).toBeInTheDocument();
    expect(screen.getByText('Accuracy Verification')).toBeInTheDocument();
  });

  it('completed step shows check icon and result description', () => {
    const steps = makeSteps({
      'hiring-manager': {
        step: 'hiring-manager',
        status: 'completed',
        data: {
          step: 'hiring-manager',
          matchScore: 85,
          missingKeywords: ['React', 'TypeScript'],
          summary: 'Good match',
          cvLanguage: 'en',
        },
      },
    });

    render(
      <ProgressPanel steps={steps} currentStepNumber={2} onCancel={vi.fn()} />,
    );

    expect(
      screen.getByText('Match score: 85 · 2 missing keywords found'),
    ).toBeInTheDocument();

    const stepEl = screen.getByLabelText(/Step 1.*completed/);
    expect(stepEl).toBeInTheDocument();
  });

  it('active step shows step number and active description', () => {
    const steps = makeSteps({
      'hiring-manager': {
        step: 'hiring-manager',
        status: 'running',
      },
    });

    render(
      <ProgressPanel steps={steps} currentStepNumber={1} onCancel={vi.fn()} />,
    );

    expect(
      screen.getByText('Analyzing job requirements...'),
    ).toBeInTheDocument();

    const stepEl = screen.getByLabelText(/Step 1.*running/);
    expect(stepEl).toBeInTheDocument();
  });

  it('pending step shows "Waiting..." text', () => {
    render(<ProgressPanel {...defaultProps} />);

    const waitingElements = screen.getAllByText('Waiting...');
    expect(waitingElements.length).toBe(4);
  });

  it('Cancel button calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<ProgressPanel {...defaultProps} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('step labels match config order', () => {
    const { container } = render(<ProgressPanel {...defaultProps} />);

    const expectedLabels = [
      'Hiring Manager Review',
      'Rewriting Resume',
      'Accuracy Verification',
      'ATS Compatibility Scan',
    ];

    const labelElements = container.querySelectorAll('[aria-label]');
    const ariaLabels = Array.from(labelElements).map((el) =>
      el.getAttribute('aria-label'),
    );

    expectedLabels.forEach((label, index) => {
      expect(ariaLabels[index]).toContain(label);
    });
  });
});
