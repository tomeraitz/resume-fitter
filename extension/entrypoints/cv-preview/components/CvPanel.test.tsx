import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CvPanel } from './CvPanel';

describe('CvPanel', () => {
  it('renders CV HTML content', () => {
    render(<CvPanel cvHtml="<h1>John Doe</h1><p>Software Engineer</p>" />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Software Engineer')).toBeInTheDocument();
  });

  it('renders within a 600px paper container', () => {
    const { container } = render(<CvPanel cvHtml="<p>test</p>" />);
    const paper = container.querySelector('.w-\\[600px\\]');
    expect(paper).toBeInTheDocument();
  });
});
