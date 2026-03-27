import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CvPanel } from './CvPanel';

describe('CvPanel', () => {
  it('renders an iframe with CV HTML', () => {
    const { container } = render(<CvPanel cvHtml="<h1>John Doe</h1><p>Software Engineer</p>" />);
    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe?.getAttribute('srcDoc')).toContain('John Doe');
    expect(iframe?.getAttribute('title')).toBe('CV Preview');
  });

  it('renders within a 620px paper container', () => {
    const { container } = render(<CvPanel cvHtml="<p>test</p>" />);
    const paper = container.querySelector('.w-\\[620px\\]');
    expect(paper).toBeInTheDocument();
  });
});
