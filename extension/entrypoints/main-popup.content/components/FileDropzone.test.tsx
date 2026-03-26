import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FileDropzone } from './FileDropzone';

describe('FileDropzone', () => {
  it('renders upload icon and instructional text', () => {
    render(<FileDropzone onFileSelect={vi.fn()} />);
    expect(screen.getByText('Drop your CV here or click to browse')).toBeInTheDocument();
    expect(screen.getByText('PDF up to 2MB')).toBeInTheDocument();
  });

  it('has correct accessibility attributes', () => {
    render(<FileDropzone onFileSelect={vi.fn()} />);
    const container = screen.getByRole('button', { name: 'Upload CV file' });
    expect(container).toHaveAttribute('tabindex', '0');
  });

  it('hidden file input has correct accept attribute', () => {
    const { container } = render(<FileDropzone onFileSelect={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toHaveAttribute('accept', '.pdf');
    expect(input).toHaveAttribute('aria-hidden', 'true');
    expect(input).toHaveAttribute('tabindex', '-1');
  });

  it('click triggers hidden file input', () => {
    const { container } = render(<FileDropzone onFileSelect={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const dropzone = screen.getByRole('button', { name: 'Upload CV file' });
    fireEvent.click(dropzone);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('keyboard activation (Enter) triggers file input', () => {
    const { container } = render(<FileDropzone onFileSelect={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const dropzone = screen.getByRole('button', { name: 'Upload CV file' });
    fireEvent.keyDown(dropzone, { key: 'Enter' });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('keyboard activation (Space) triggers file input', () => {
    const { container } = render(<FileDropzone onFileSelect={vi.fn()} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click');
    const dropzone = screen.getByRole('button', { name: 'Upload CV file' });
    fireEvent.keyDown(dropzone, { key: ' ' });
    expect(clickSpy).toHaveBeenCalled();
  });

  it('file selection calls onFileSelect', () => {
    const onFileSelect = vi.fn();
    const { container } = render(<FileDropzone onFileSelect={onFileSelect} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('drag over applies visual state', () => {
    render(<FileDropzone onFileSelect={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: 'Upload CV file' });
    fireEvent.dragOver(dropzone);
    expect(dropzone.className).toContain('border-accent-400');
    expect(dropzone.className).toContain('bg-accent-50');
  });

  it('drag leave removes visual state', () => {
    render(<FileDropzone onFileSelect={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: 'Upload CV file' });
    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);
    expect(dropzone.className).toContain('border-surface-200');
    expect(dropzone.className).toContain('bg-surface-50');
  });

  it('drop calls onFileSelect with dropped file', () => {
    const onFileSelect = vi.fn();
    render(<FileDropzone onFileSelect={onFileSelect} />);
    const dropzone = screen.getByRole('button', { name: 'Upload CV file' });
    const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('drop calls preventDefault', () => {
    render(<FileDropzone onFileSelect={vi.fn()} />);
    const dropzone = screen.getByRole('button', { name: 'Upload CV file' });
    const prevented = fireEvent.drop(dropzone, {
      dataTransfer: { files: [] },
    });
    // fireEvent returns false if preventDefault was called
    expect(prevented).toBe(false);
  });
});
