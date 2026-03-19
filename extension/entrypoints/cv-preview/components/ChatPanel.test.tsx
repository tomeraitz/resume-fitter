import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from './ChatPanel';

describe('ChatPanel', () => {
  it('renders the "CV Assistant" header', () => {
    render(<ChatPanel />);
    expect(screen.getByText('CV Assistant')).toBeInTheDocument();
  });

  it('renders the system success message', () => {
    render(<ChatPanel />);
    expect(
      screen.getByText(/pipeline complete/i),
    ).toBeInTheDocument();
  });

  it('renders a sample AI message', () => {
    render(<ChatPanel />);
    expect(screen.getByText(/your cv is ready/i)).toBeInTheDocument();
  });

  it('renders a disabled input with placeholder', () => {
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText('Ask about your CV...');
    expect(input).toBeDisabled();
  });

  it('renders a disabled send button', () => {
    render(<ChatPanel />);
    const sendBtn = screen.getByRole('button', { name: /send message/i });
    expect(sendBtn).toBeDisabled();
  });

  it('shows "Chat coming soon" note', () => {
    render(<ChatPanel />);
    expect(screen.getByText('Chat coming soon')).toBeInTheDocument();
  });
});
