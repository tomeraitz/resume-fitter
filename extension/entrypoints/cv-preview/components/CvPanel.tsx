interface CvPanelProps {
  cvHtml: string;
}

export function CvPanel({ cvHtml }: CvPanelProps) {
  return (
    <div className="flex-1 overflow-auto bg-surface-100 p-8">
      <div className="mx-auto w-[620px] rounded bg-white shadow-card">
        <iframe
          srcDoc={cvHtml}
          title="CV Preview"
          className="h-[875px] w-full border-0"
          sandbox="allow-same-origin"
        />
      </div>
    </div>
  );
}
