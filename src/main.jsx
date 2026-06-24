/**
 * @fileoverview Application entry point.
 * Mounts the React tree into #root and loads global styles.
 */

import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './css/styles.scss';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Root element #root not found. Check index.html.');
}

ReactDOM.createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
