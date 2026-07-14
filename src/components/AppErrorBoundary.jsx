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
import { reportErrorToSentry } from '../lib/reportError.js';

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
   * @param {Error} error
   * @param {{componentStack: string}} info
   */
  componentDidCatch(error, info) {
    reportErrorToSentry(error, info);
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
