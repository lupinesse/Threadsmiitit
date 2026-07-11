/**
 * @fileoverview Threads OAuth authentication context.
 *
 * Identity is resolved server-side: an httpOnly `tm_session` cookie (minted
 * by netlify/functions/auth-callback.js) is the source of truth, verified by
 * Netlify Functions on every request. The client never reads or stores the
 * session itself — it only asks the server who it is via `whoami`.
 *
 * login()  — redirects the browser to /api/auth/login (Netlify Function).
 * logout() — clears the server-side session cookie via /api/auth/logout.
 */

import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

/**
 * Wraps the app with Threads auth state.
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authError, setAuthError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.location.hash === '#auth=error') {
      setAuthError(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    fetch('/api/auth/whoami', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setUser(data);
          setIsAdmin(!!data.isAdmin);
        }
      })
      .catch(() => {
        // Network failure — treat as logged out; whoami is re-tried on next mount.
      })
      .finally(() => setLoading(false));
  }, []);

  /** Redirects to the Threads OAuth authorization page. */
  function login() {
    window.location.href = '/api/auth/login';
  }

  /** Clears the server-side session and local auth state. */
  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch {
      // Best-effort — local state is cleared regardless so the UI reflects logout.
    }
    setUser(null);
    setIsAdmin(false);
  }

  /** Dismisses the OAuth error banner. */
  function clearAuthError() {
    setAuthError(false);
  }

  return (
    <AuthContext.Provider
      value={{ user, login, logout, authError, clearAuthError, isAdmin, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Returns the current auth context.
 * @returns {object} Auth context with user (or null), login, logout, isAdmin, and loading.
 */
export function useAuth() {
  return useContext(AuthContext);
}
