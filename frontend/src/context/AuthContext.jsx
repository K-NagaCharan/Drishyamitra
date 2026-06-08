import React, { createContext, useState, useEffect, useCallback } from 'react';
import api, { registerAuthInterceptor } from '../services/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  // Define logout first so it can be referenced in interceptors and other functions
  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
    setToken(null);
    setIsAuthenticated(false);
  }, []);

  // Fetch current user details
  const fetchCurrentUser = useCallback(async (authToken) => {
    try {
      const response = await api.get('/auth/me');
      if (response.data && response.data.success) {
        setUser(response.data.data.user);
        setToken(authToken);
        setIsAuthenticated(true);
      } else {
        logout();
      }
    } catch (error) {
      logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  // Login handler
  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    if (response.data && response.data.success) {
      const { token: newToken, user: newUser } = response.data.data;
      localStorage.setItem('token', newToken);
      setUser(newUser);
      setToken(newToken);
      setIsAuthenticated(true);
    }
    return response.data;
  };

  // Register handler
  const register = async (username, email, password) => {
    const response = await api.post('/auth/register', { username, email, password });
    if (response.data && response.data.success) {
      const { token: newToken, user: newUser } = response.data.data;
      localStorage.setItem('token', newToken);
      setUser(newUser);
      setToken(newToken);
      setIsAuthenticated(true);
    }
    return response.data;
  };

  // Initialize and register the 401 global interceptor on boot
  useEffect(() => {
    registerAuthInterceptor(logout);

    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      fetchCurrentUser(storedToken);
    } else {
      setLoading(false);
    }
  }, [logout, fetchCurrentUser]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        loading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
