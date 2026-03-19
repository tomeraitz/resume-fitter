import { useCvPreviewData } from './hooks/useCvPreviewData';
import { PreviewTopBar } from './components/PreviewTopBar';
import { CvPanel } from './components/CvPanel';
import { ChatPanel } from './components/ChatPanel';
import { clearPipelineSession } from '../../services/storage';

export function App() {
  const previewState = useCvPreviewData();

  const closeAndClear = async () => {
    await clearPipelineSession();
    window.close();
  };

  const handleDownload = () => {
    if (previewState.status !== 'ready') return;

    const blob = new Blob([previewState.data.finalCv], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tailored-cv.html';
    a.click();

    // Delay closing so the browser can initiate the download
    setTimeout(async () => {
      URL.revokeObjectURL(url);
      await closeAndClear();
    }, 500);
  };

  const handleCancel = async () => {
    await closeAndClear();
  };

  if (previewState.status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center font-body text-md text-surface-500">
        Loading CV preview...
      </div>
    );
  }

  if (previewState.status === 'empty') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 font-body">
        <p className="text-md text-surface-700">No CV data available</p>
        <p className="text-sm text-surface-500">
          The pipeline session may have been cleared or has not completed yet.
        </p>
        <button
          type="button"
          onClick={() => window.close()}
          className="mt-2 rounded bg-surface-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-surface-800"
        >
          Close tab
        </button>
      </div>
    );
  }

  const { data } = previewState;

  return (
    <div className="flex h-screen flex-col">
      <PreviewTopBar
        jobTitle={data.jobTitle}
        atsScore={data.atsScore}
        matchScore={data.matchScore}
        onDownload={handleDownload}
        onCancel={handleCancel}
      />
      <div className="flex flex-1 overflow-hidden">
        <CvPanel cvHtml={data.finalCv} />
        <ChatPanel />
      </div>
    </div>
  );
}
