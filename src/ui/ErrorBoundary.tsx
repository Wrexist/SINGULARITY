import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangleIcon } from "./Icons";

interface Props { children: ReactNode }
interface State { error: Error | null }

/**
 * App-wide crash guard. Without this, a render error anywhere below white-screens
 * the whole app (a hard fail on iOS). Here it's caught and shown as a calm recovery
 * screen instead. The save lives in localStorage and is untouched by a render crash,
 * so "Reload" almost always restores the player exactly where they were.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for diagnostics (TestFlight / remote-inspected builds). Not user-facing.
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <div className="crash-mark" aria-hidden="true"><AlertTriangleIcon size={30} /></div>
          <h1>Something glitched</h1>
          <p>
            The lab hit an unexpected error — but your progress is safe on this
            device. Reloading almost always picks up right where you left off.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload the lab
          </button>
        </div>
      </div>
    );
  }
}
