/**
 * @fileoverview Wraps its children in Sentry's `ErrorBoundary` with a fixed
 * Finnish fallback message. Extracted from `main.jsx` so the boundary
 * wiring itself is a small, testable unit — `main.jsx`'s DOM-mounting side
 * effects (`document.getElementById`, `ReactDOM.createRoot(...).render`)
 * can't be exercised in a test harness the same way a component can.
 */
import { Sentry } from '../lib/sentry.js';

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 */
export function AppErrorBoundary({ children }) {
  return (
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <p>Jokin meni pieleen. Yritä päivittää sivu.</p>
        </div>
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
