import { useState } from 'react';
import type { ConvertPdfResponse } from '../../../types/messages';
import { fileToBase64 } from '../utils/fileToBase64';

interface UseDownloadHtmlReturn {
  downloadHtml: (file: File) => Promise<void>;
  isDownloading: boolean;
  error: string | null;
}

export function useDownloadHtml(): UseDownloadHtmlReturn {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const downloadHtml = async (file: File): Promise<void> => {
    setIsDownloading(true);
    setError(null);

    try {
      const pdfBase64 = await fileToBase64(file);

      const response: ConvertPdfResponse = await browser.runtime.sendMessage({
        type: 'convert-pdf',
        pdfBase64,
        fileName: file.name,
      });

      if (!response.success) {
        setError(response.error);
        return;
      }

      const blob = new Blob([response.html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);

      const baseName = file.name.replace(/\.[^.]+$/, '');
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${baseName}.html`;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();

      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
        anchor.remove();
      }, 100);
    } catch (err) {
      console.error('[download-html] error:', err instanceof Error ? err.message : 'unknown');
      setError('Cannot reach server.');
    } finally {
      setIsDownloading(false);
    }
  };

  return { downloadHtml, isDownloading, error };
}
