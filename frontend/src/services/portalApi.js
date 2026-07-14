import axios from 'axios';
import { API_ORIGIN } from './api';

// Separate axios instance for the candidate-facing careers portal. It uses its
// OWN token (`applicant_token`) so a recruiter and an applicant can be signed in
// in the same browser without colliding, and a portal 401 sends the visitor to
// the portal login — never the recruiter login.
const portalApi = axios.create({
  baseURL: `${API_ORIGIN}/api/portal`,
  headers: { 'Content-Type': 'application/json' },
});

portalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('applicant_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('applicant_token');
      localStorage.removeItem('applicant');
      const path = window.location.pathname;
      // Don't bounce while on the auth screens themselves.
      if (!/\/portal\/(login|register|forgot|reset)/.test(path) && path.startsWith('/portal')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default portalApi;
