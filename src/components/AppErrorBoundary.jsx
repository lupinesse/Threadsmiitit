/**
 * @fileoverview Top-level React error boundary with a fixed Finnish fallback
 * message. Extracted from `main.jsx` so the boundary wiring itself is a
 * small, testable unit — `main.jsx`'s DOM-mounting side effects
 * (`document.getElementById`, `ReactDOM.createRoot(...).render`) can't be
 * exercised in a test harness the same way a component can.
 *
 * Implemented as a plain class boundary (not `Sentry.ErrorBoundary`) so the
 * ~475 KB `@sentry/react` SDK isn't part of the chunk needed for first
 * paint — Sentry is loaded lazily, only if an error actually occurs (see
 * issue #81, code-splitting the client bundle).
 */
import { Component } from 'react';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children - The application component tree
 *   (or any other UI elements) to render, guarded by this error boundary.
 */
export class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  /**
   * Reports the caught error to Sentry, loading the SDK on demand — an
   * uncaught render error is rare enough that paying its chunk's load cost
   * only when it actually happens is a better trade than bundling Sentry
   * into every user's first load.
   * @param {Error} error
   * @param {{componentStack: string}} info
   */
  componentDidCatch(error, info) {
    import('../lib/sentry.js')
      .then(({ Sentry }) => {
        Sentry.captureException(error, {
          contexts: { react: { componentStack: info.componentStack } },
        });
      })
      .catch((loadError) => {
        // The Sentry chunk itself failed to load (e.g. offline) — the
        // original render error is already logged by React's own error
        // boundary reporting, so this is only about the reporting path.
        console.warn('[AppErrorBoundary] Failed to load Sentry to report error:', loadError);
      });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <p>Jokin meni pieleen. Yritä päivittää sivu.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
