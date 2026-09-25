import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-shell narrow stack-lg">
          <div className="error-banner">
            Something went wrong on this page: {this.state.error.message}
          </div>
          <button className="primary-button" onClick={() => window.location.reload()} type="button">
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
