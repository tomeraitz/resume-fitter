import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Resume Fitter] Overlay crashed:', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center p-6 text-center font-body text-sm text-surface-700"
        >
          <p className="mb-2 font-semibold">Something went wrong</p>
          <p className="mb-4 text-surface-500">
            The Resume Fitter overlay encountered an error.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="rounded-md bg-accent-400 px-4 py-2 text-sm font-medium text-white shadow-button transition-colors hover:bg-accent-500"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
