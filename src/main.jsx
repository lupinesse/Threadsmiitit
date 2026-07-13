/**
 * @fileoverview Application entry point.
 * Mounts the React tree into #root and loads global styles.
 */

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.jsx';
import { initSentry } from './lib/sentry.js';
import './css/styles.scss';

initSentry();

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
