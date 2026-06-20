import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("App crashed:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-[#0a0b12] text-white flex items-center justify-center p-6">
          <div className="card max-w-lg w-full p-6 text-center">
            <h1 className="text-lg font-normal mb-2">Something went wrong</h1>
            <p className="text-sm text-[#71717a] mb-4">{this.state.error.message}</p>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}