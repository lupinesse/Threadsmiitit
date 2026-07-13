/**
 * @fileoverview Application entry point.
 * Mounts the React tree into #root and loads global styles.
 */

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { initSentry, Sentry } from './lib/sentry.js';
import './css/styles.scss';

initSentry();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found. Check index.html.');
}

ReactDOM.createRoot(root).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div style={{ padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
          <p>Jokin meni pieleen. Yritä päivittää sivu.</p>
        </div>
      }
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);
