import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MainPopup } from './MainPopup';
import type { PopupStatus } from './MainPopup';

// Mock the browser global used by PopupFooter
const mockGetManifest = vi.fn(() => ({ version: '0.1.0' }));

vi.stubGlobal('browser', {
  runtime: {
    getManifest: mockGetManifest,
  },
});

describe('MainPopup', () => {
  const defaultProps = {
    status: 'connected' as PopupStatus,
    onClose: vi.fn(),
    children: <p>Test content</p>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the header with "Resume Fitter" title', () => {
    render(<MainPopup {...defaultProps} />);
    expect(screen.getByText('Resume Fitter')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<MainPopup {...defaultProps} />);
    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn();
    render(<MainPopup {...defaultProps} onClose={onClose} />);

    const closeButton = screen.getByRole('button', { name: /close popup/i });
    await userEvent.click(closeButton);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows green dot for connected status', () => {
    render(<MainPopup {...defaultProps} status="connected" />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('shows warning dot for incomplete status', () => {
    render(<MainPopup {...defaultProps} status="incomplete" />);
    expect(screen.getByText('Profile incomplete')).toBeInTheDocument();
  });

  it('displays the extension version from manifest', () => {
    render(<MainPopup {...defaultProps} />);
    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
  });
});
