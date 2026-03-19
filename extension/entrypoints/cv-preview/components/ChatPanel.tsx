import { Send, Sparkles, CheckCircle } from 'lucide-react';

export function ChatPanel() {
  return (
    <div className="flex w-[400px] shrink-0 flex-col border-l border-surface-200 bg-surface-50">
      {/* Chat header */}
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-surface-200 px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-100">
          <Sparkles size={14} className="text-accent-600" />
        </div>
        <span className="font-body text-sm font-semibold text-surface-800">
          CV Assistant
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* System success message */}
        <div className="mb-4 flex items-start gap-2 rounded-md bg-success-50 p-3">
          <CheckCircle size={16} className="mt-0.5 shrink-0 text-success-700" />
          <p className="font-body text-xs text-success-700">
            Pipeline complete — your CV has been tailored to the job description.
            Ask me to make adjustments.
          </p>
        </div>

        {/* Sample AI message */}
        <div className="mb-4 max-w-[320px] rounded-lg border border-surface-200 bg-white p-3">
          <p className="font-body text-sm text-surface-700">
            Your CV is ready! I can help you adjust the wording, highlight
            specific skills, or restructure sections. What would you like to
            change?
          </p>
        </div>
      </div>

      {/* Chat input area */}
      <div className="shrink-0 border-t border-surface-200 p-3">
        <div className="flex items-center gap-2 rounded-md border border-surface-200 bg-white px-3 py-2">
          <input
            type="text"
            placeholder="Ask about your CV..."
            disabled
            className="flex-1 bg-transparent font-body text-sm text-surface-800 placeholder:text-surface-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <button
            type="button"
            disabled
            aria-label="Send message"
            className="flex h-7 w-7 items-center justify-center rounded bg-accent-400 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="mt-1.5 font-body text-2xs text-surface-400">
          Chat coming soon
        </p>
      </div>
    </div>
  );
}
