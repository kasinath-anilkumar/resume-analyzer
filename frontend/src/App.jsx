import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { UploadProvider } from './context/UploadContext';
import { PosterExtractionProvider } from './context/PosterExtractionContext';
import DashboardLayout from './layouts/DashboardLayout';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Careers from './pages/Careers';
import CareerApply from './pages/CareerApply';
import { ApplicantAuthProvider, useApplicantAuth } from './context/ApplicantAuthContext';
import PortalRegister from './pages/portal/PortalRegister';
import PortalReset from './pages/portal/PortalReset';
import PortalDashboard from './pages/portal/PortalDashboard';
import PortalApplicationDetail from './pages/portal/PortalApplicationDetail';
import PortalProfile from './pages/portal/PortalProfile';
import Dashboard from './pages/Dashboard';
import Jobs from './pages/Jobs';
import JobForm from './pages/JobForm';
import Candidates from './pages/Candidates';
import Trash from './pages/Trash';
import Shortlist from './pages/Shortlist';
import CandidateDetails from './pages/CandidateDetails';
import Upload from './pages/Upload';
import Pipeline from './pages/Pipeline';
import Compare from './pages/Compare';
import Settings from './pages/Settings';
import UsersPage from './pages/Users';
import AuditLog from './pages/AuditLog';
import Notifications from './pages/Notifications';
import { Loader2 } from 'lucide-react';

// Route lock component to guard private dashboard panels
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-darkBg text-slate-500">
        <Loader2 size={24} className="animate-spin text-brand-500 mb-2" />
        <span className="text-xs font-semibold">Validating session credentials...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Guard for the candidate-facing careers portal (separate identity from recruiters).
const RequirePortalAuth = ({ children }) => {
  const { applicant, loading } = useApplicantAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-luxury-gradient text-slate-500">
        <Loader2 size={24} className="animate-spin text-[#c5a880]" />
      </div>
    );
  }
  if (!applicant) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UploadProvider>
          <PosterExtractionProvider>
          <ApplicantAuthProvider>
          <Router>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/careers" element={<Careers />} />
            <Route path="/careers/:id" element={<CareerApply />} />

            {/* Candidate-facing careers portal */}
            <Route path="/portal/login" element={<Navigate to="/login" replace />} />
            <Route path="/portal/register" element={<PortalRegister />} />
            <Route path="/portal/reset-password" element={<PortalReset />} />
            <Route path="/portal" element={<Navigate to="/portal/dashboard" replace />} />
            <Route path="/portal/dashboard" element={<RequirePortalAuth><PortalDashboard /></RequirePortalAuth>} />
            <Route path="/portal/applications/:id" element={<RequirePortalAuth><PortalApplicationDetail /></RequirePortalAuth>} />
            <Route path="/portal/profile" element={<RequirePortalAuth><PortalProfile /></RequirePortalAuth>} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="jobs" element={<Jobs />} />
              <Route path="jobs/new" element={<JobForm />} />
              <Route path="jobs/:id/edit" element={<JobForm />} />
              <Route path="upload" element={<Upload />} />
              <Route path="candidates" element={<Candidates />} />
              <Route path="trash" element={<Trash />} />
              <Route path="shortlist" element={<Shortlist />} />
              <Route path="candidates/:id" element={<CandidateDetails />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="compare" element={<Compare />} />
              <Route path="settings" element={<Settings />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="notifications" element={<Notifications />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
          </ApplicantAuthProvider>
          </PosterExtractionProvider>
        </UploadProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
