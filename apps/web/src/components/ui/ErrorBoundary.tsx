"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[PlumbTrack] Unhandled render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-md mx-auto min-h-screen bg-[var(--page-bg)] flex flex-col items-center justify-center px-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-urgent-dim border border-urgent-line flex items-center justify-center mb-6">
            <AlertTriangle size={32} className="text-urgent" />
          </div>
          <h1 className="text-xl font-bold text-ink mb-2">Something went wrong</h1>
          <p className="text-sm text-ink-low mb-6 max-w-xs leading-relaxed">
            An unexpected error occurred. Your data is safe — tap reload to recover.
          </p>
          <details className="mb-6 w-full max-w-sm text-left">
            <summary className="text-xs text-ink-low cursor-pointer mb-2">
              Technical details
            </summary>
            <pre className="text-xs text-urgent bg-urgent-dim border border-urgent-line rounded-xl p-3 overflow-auto max-h-32">
              {this.state.error.message}
            </pre>
          </details>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-on-accent font-semibold text-sm active:scale-95 transition"
          >
            <RefreshCw size={16} />
            Reload App
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}