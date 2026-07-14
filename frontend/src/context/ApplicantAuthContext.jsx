import React, { createContext, useContext, useState, useEffect } from 'react';
import portalApi from '../services/portalApi';

// Auth state for the candidate-facing careers portal — completely separate from
// the recruiter AuthContext (different token, different storage keys).
const ApplicantAuthContext = createContext();

export const ApplicantAuthProvider = ({ children }) => {
  const [applicant, setApplicant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const stored = localStorage.getItem('applicant');
      const token = localStorage.getItem('applicant_token');
      if (stored && token) {
        try {
          setApplicant(JSON.parse(stored));
          const res = await portalApi.get('/me');
          if (res.data.success) {
            const me = { _id: res.data._id, name: res.data.name, email: res.data.email };
            setApplicant(me);
            localStorage.setItem('applicant', JSON.stringify(me));
          }
        } catch {
          logout();
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const persist = (data) => {
    const { token, success, ...profile } = data;
    localStorage.setItem('applicant_token', token);
    localStorage.setItem('applicant', JSON.stringify(profile));
    setApplicant(profile);
  };

  const asError = (error, fallback) => {
    if (!error.response) {
      return { success: false, code: 'NETWORK', message: 'Could not reach the server — it may be waking up. Please try again in a few seconds.' };
    }
    return { success: false, message: error.response?.data?.message || fallback };
  };

  const register = async (payload) => {
    try {
      const res = await portalApi.post('/register', payload);
      if (res.data.success) { persist(res.data); return { success: true }; }
      return { success: false, message: res.data.message };
    } catch (error) {
      return asError(error, 'Could not create your account.');
    }
  };

  const login = async (email, password) => {
    try {
      const res = await portalApi.post('/login', { email, password });
      if (res.data.success) { persist(res.data); return { success: true }; }
      return { success: false, message: res.data.message };
    } catch (error) {
      return asError(error, 'Login failed. Please check your credentials.');
    }
  };

  const forgotPassword = async (email) => {
    try {
      const res = await portalApi.post('/forgot-password', { email });
      return { success: true, message: res.data.message };
    } catch (error) {
      return asError(error, 'Password reset request failed.');
    }
  };

  const resetPassword = async (payload) => {
    try {
      const res = await portalApi.post('/reset-password', payload);
      return { success: !!res.data.success, message: res.data.message };
    } catch (error) {
      return asError(error, 'Could not reset your password.');
    }
  };

  const logout = () => {
    localStorage.removeItem('applicant_token');
    localStorage.removeItem('applicant');
    setApplicant(null);
  };

  return (
    <ApplicantAuthContext.Provider value={{ applicant, loading, register, login, forgotPassword, resetPassword, logout }}>
      {children}
    </ApplicantAuthContext.Provider>
  );
};

export const useApplicantAuth = () => useContext(ApplicantAuthContext);
