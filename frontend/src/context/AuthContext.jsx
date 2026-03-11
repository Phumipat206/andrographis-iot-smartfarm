import { createContext, useContext, useState, useEffect } from 'react';
import { apiUrl } from '../config.js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    // Check sessionStorage first (non-remembered), then localStorage (remembered)
    const sessionUser = sessionStorage.getItem('user');
    const localUser = localStorage.getItem('user');
    const saved = sessionUser || localUser;
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => {
    return sessionStorage.getItem('token') || localStorage.getItem('token') || null;
  });
  const [remember, setRemember] = useState(() => {
    return localStorage.getItem('rememberMe') === 'true';
  });

  useEffect(() => {
    if (user) {
      if (remember) {
        localStorage.setItem('user', JSON.stringify(user));
      } else {
        sessionStorage.setItem('user', JSON.stringify(user));
      }
    } else {
      localStorage.removeItem('user');
      sessionStorage.removeItem('user');
    }
  }, [user, remember]);

  useEffect(() => {
    if (token) {
      if (remember) {
        localStorage.setItem('token', token);
      } else {
        sessionStorage.setItem('token', token);
      }
    } else {
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
    }
  }, [token, remember]);

  const login = async (username, password, rememberMe) => {
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        let errMsg = 'Login failed';
        try {
          const err = await res.json();
          errMsg = err.detail || errMsg;
        } catch { /* non-JSON response */ }
        throw new Error(errMsg);
      }
      const data = await res.json();
      setRemember(!!rememberMe);
      if (rememberMe) {
        localStorage.setItem('rememberMe', 'true');
      } else {
        localStorage.removeItem('rememberMe');
      }
      setUser(data.user);
      setToken(data.access_token);
      return data;
    } catch (error) {
      throw error;
    }
  };

  const register = async (username, password, userType) => {
    try {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, user_type: userType }),
      });
      if (!res.ok) {
        let errMsg = 'Registration failed';
        try {
          const err = await res.json();
          errMsg = err.detail || errMsg;
        } catch { /* non-JSON response */ }
        throw new Error(errMsg);
      }
      return await res.json();
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setRemember(false);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('token');
  };

  /**
   * Helper to build fetch headers with Authorization token.
   * Usage: fetch(url, { headers: authHeaders() })
   */
  const authHeaders = (extra = {}) => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  });

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, isAuthenticated: !!token, authHeaders }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
