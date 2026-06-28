/**
 * @fileoverview Threads OAuth authentication context.
 *
 * After a successful OAuth redirect the Netlify auth-callback function
 * redirects to /#auth=<base64-user-json>. AuthProvider picks this up on
 * mount, stores the profile in localStorage, and clears the hash.
 *
 * login()  — redirects the browser to /api/auth/login (Netlify Function).
 * logout() — clears local state only; does not revoke the Threads token.
 */

import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'threadsmiitit_user_v1';

const AuthContext = createContext(null);

/**
 * Wraps the app with Threads auth state.
 * @param {object} props
 * @returns {React.ReactElement}
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#auth=')) return;
    const encoded = hash.slice(6);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    if (encoded === 'error') {
      setAuthError(true);
      return;
    }
    try {
      const parsed = JSON.parse(atob(encoded));
      setUser(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // Ignore malformed payload — user stays logged out
    }
  }, []);

  /** Redirects to the Threads OAuth authorization page. */
  function login() {
    window.location.href = '/api/auth/login';
  }

  /** Clears the local session. */
  function logout() {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  /** Dismisses the OAuth error banner. */
  function clearAuthError() {
    setAuthError(false);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, authError, clearAuthError }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Returns the current auth context.
 * @returns {object} Auth context with user (or null), login, and logout.
 */
export function useAuth() {
  return useContext(AuthContext);
}
