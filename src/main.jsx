/**
 * @fileoverview Application entry point.
 * Mounts the React tree into #root and loads global styles.
 */

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx';
import './css/styles.scss';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found. Check index.html.');
}

ReactDOM.createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>
);

/**
 * Loads and configures Sentry after first paint rather than blocking it —
 * the SDK is ~475 KB and monitoring doesn't need to be live before the UI
 * is visible (see issue #81, code-splitting the client bundle).
 */
function loadSentryWhenIdle() {
  import('./lib/sentry.js').then(({ initSentry }) => initSentry());
}

if ('requestIdleCallback' in window) {
  requestIdleCallback(loadSentryWhenIdle);
} else {
  setTimeout(loadSentryWhenIdle, 0);
}
