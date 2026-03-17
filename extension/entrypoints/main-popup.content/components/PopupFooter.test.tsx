import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PopupFooter } from './PopupFooter';
import type { PopupStatus } from './MainPopup';

// Mock the browser global used by PopupFooter
const mockGetManifest = vi.fn(() => ({ version: '0.1.0' }));

vi.stubGlobal('browser', {
  runtime: {
    getManifest: mockGetManifest,
  },
});

describe('PopupFooter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Extracting..." label when status is extracting', () => {
    render(<PopupFooter status="extracting" />);
    expect(screen.getByText('Extracting...')).toBeInTheDocument();
  });

  it('renders "Ready to fit" label when status is ready', () => {
    render(<PopupFooter status="ready" />);
    expect(screen.getByText('Ready to fit')).toBeInTheDocument();
  });

  it('renders "Connected" label when status is connected', () => {
    render(<PopupFooter status="connected" />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders "Profile incomplete" label when status is incomplete', () => {
    render(<PopupFooter status="incomplete" />);
    expect(screen.getByText('Profile incomplete')).toBeInTheDocument();
  });

  it('renders "Profile complete" label when status is complete', () => {
    render(<PopupFooter status="complete" />);
    expect(screen.getByText('Profile complete')).toBeInTheDocument();
  });

  it('renders "Error" label when status is error', () => {
    render(<PopupFooter status="error" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('renders "Step 2 of 4" with amber dot for pipeline status with pipelineStep=2', () => {
    const { container } = render(<PopupFooter status="pipeline" pipelineStep={2} />);
    expect(screen.getByText('Step 2 of 4')).toBeInTheDocument();
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot?.className).toContain('bg-accent-400');
  });

  it('defaults to "Step 1 of 4" when pipeline status has no pipelineStep', () => {
    render(<PopupFooter status="pipeline" />);
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument();
  });

  it('renders "Complete" with green dot for pipeline-done status', () => {
    const { container } = render(<PopupFooter status="pipeline-done" />);
    expect(screen.getByText('Complete')).toBeInTheDocument();
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot?.className).toContain('bg-success-500');
  });

  it('displays the extension version from manifest', () => {
    render(<PopupFooter status="connected" />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });
});
