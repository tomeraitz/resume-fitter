interface CvPanelProps {
  cvHtml: string;
}

export function CvPanel({ cvHtml }: CvPanelProps) {
  return (
    <div className="flex-1 overflow-auto bg-white p-8">
      <div className="mx-auto w-[600px] rounded bg-white p-8 pt-10 shadow-card">
        <div dangerouslySetInnerHTML={{ __html: cvHtml }} />
      </div>
    </div>
  );
}
