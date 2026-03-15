import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileUploaded } from './FileUploaded';

describe('FileUploaded', () => {
  const defaultProps = {
    fileName: 'resume.pdf',
    fileSize: 245000,
    onChangeFile: vi.fn(),
  };

  it('renders file name', () => {
    render(<FileUploaded {...defaultProps} />);
    expect(screen.getByText('resume.pdf')).toBeInTheDocument();
  });

  it('renders formatted file size (bytes)', () => {
    render(<FileUploaded {...defaultProps} fileSize={500} />);
    expect(screen.getByText('500 B')).toBeInTheDocument();
  });

  it('renders formatted file size (KB)', () => {
    render(<FileUploaded {...defaultProps} fileSize={245000} />);
    expect(screen.getByText('239 KB')).toBeInTheDocument();
  });

  it('renders formatted file size (MB)', () => {
    render(<FileUploaded {...defaultProps} fileSize={2500000} />);
    expect(screen.getByText('2.4 MB')).toBeInTheDocument();
  });

  it('renders "Change" button', () => {
    render(<FileUploaded {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument();
  });

  it('clicking "Change" calls onChangeFile', () => {
    const onChangeFile = vi.fn();
    render(<FileUploaded {...defaultProps} onChangeFile={onChangeFile} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onChangeFile).toHaveBeenCalledOnce();
  });

  it('file name truncates long names', () => {
    render(
      <FileUploaded
        {...defaultProps}
        fileName="this_is_a_very_long_file_name_that_should_be_truncated.pdf"
      />,
    );
    const nameEl = screen.getByText(
      'this_is_a_very_long_file_name_that_should_be_truncated.pdf',
    );
    expect(nameEl.className).toContain('truncate');
  });

  it('file icon is rendered', () => {
    const { container } = render(<FileUploaded {...defaultProps} />);
    // lucide-react renders an SVG element
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });
});
