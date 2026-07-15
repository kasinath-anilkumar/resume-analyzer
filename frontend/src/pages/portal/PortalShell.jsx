import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import { LogOut, LayoutGrid, Briefcase, User } from 'lucide-react';

// Shared branded frame for every careers-portal page (matches the public
// Careers/Apply luxury theme).
const PortalShell = ({ children, wide = false }) => {
  const { applicant, logout } = useApplicantAuth();
  const location = useLocation();
  const isJobs = location.pathname.startsWith('/careers');
  const isDashboard = location.pathname.startsWith('/portal/dashboard') || location.pathname.startsWith('/portal/applications');
  const isProfile = location.pathname.startsWith('/portal/profile');

  return (
    <div className="min-h-screen bg-luxury-gradient text-[#1c1c1c] dark:text-[#f5efe9] font-luxury flex flex-col justify-between">
      <div>
        <header className="border-b luxury-border-thin bg-white/40 dark:bg-black/20 backdrop-blur-sm sticky top-0 z-50">
          <div className={`${wide ? 'max-w-6xl' : 'max-w-5xl'} mx-auto px-5 py-4 flex items-center justify-between`}>
            <Link to={applicant ? '/portal/dashboard' : '/careers'} className="flex items-center space-x-3">
              <img
                src="https://parakkatjewels.com/cdn/shop/files/Logo.png?v=1711363419&width=96"
                alt="Parakkat Jewels"
                className="h-10 w-auto object-contain dark:brightness-95 dark:contrast-125"
              />
              <span className="font-luxury font-medium tracking-[0.2em] text-xs uppercase hidden sm:inline-block border-l luxury-border-thin pl-3 text-[#1c1c1c] dark:text-[#e2d1c5]">
                Careers
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <Link to="/careers" className="text-[9px] tracking-[0.15em] text-slate-500 hover:text-[#c5a880] uppercase font-semibold hidden sm:inline-flex items-center gap-1">
                <Briefcase size={11} /> Browse Jobs
              </Link>
              {applicant ? (
                <>
                  <Link to="/portal/dashboard" className="text-[9px] tracking-[0.15em] text-slate-500 hover:text-[#c5a880] uppercase font-semibold hidden sm:inline-flex items-center gap-1">
                    <LayoutGrid size={11} /> My Applications
                  </Link>
                  <Link to="/portal/profile" className="text-[9px] tracking-[0.15em] text-slate-500 hover:text-[#c5a880] uppercase font-semibold hidden sm:inline-flex items-center gap-1">
                    <User size={11} /> Profile
                  </Link>
                  <button onClick={logout} className="text-[9px] tracking-[0.15em] text-slate-500 hover:text-[#c5a880] uppercase font-semibold inline-flex items-center gap-1">
                    <LogOut size={11} /> Sign out
                  </button>
                </>
              ) : (
                <Link to="/login" className="text-[9px] tracking-[0.15em] text-[#c5a880] uppercase font-semibold">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </header>
        <div className={`${wide ? 'max-w-6xl' : 'max-w-5xl'} mx-auto px-5 pt-5 ${applicant ? 'pb-32 sm:pb-5' : 'pb-5'}`}>{children}</div>
      </div>
      <footer className={`text-center text-[9px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-600 border-t luxury-border-thin py-5 max-w-5xl mx-auto w-full ${applicant ? 'mb-28 sm:mb-0' : ''}`}>
        &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
      </footer>

      {/* Mobile Bottom Navigation Bar */}
      {applicant && (
        <div className="fixed bottom-5 left-0 right-0 mx-auto z-50 w-[92%] max-w-[380px] sm:hidden bg-white/35 dark:bg-black/35 backdrop-blur-xl rounded-full border border-white/20 dark:border-white/10 flex justify-around items-center py-2 px-2 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
          <Link
            to="/careers"
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ease-out active:scale-90 ${
              isJobs
                ? 'bg-gradient-to-r from-[#c5a880]/20 to-[#c5a880]/10 dark:from-[#c5a880]/15 dark:to-transparent text-[#c5a880] border border-[#c5a880]/25 scale-105 shadow-[0_2px_12px_rgba(197,168,128,0.12)]'
                : 'text-slate-400 dark:text-slate-500 hover:text-[#c5a880]/70 border border-transparent'
            }`}
          >
            <Briefcase size={18} />
          </Link>
          <Link
            to="/portal/dashboard"
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ease-out active:scale-90 ${
              isDashboard
                ? 'bg-gradient-to-r from-[#c5a880]/20 to-[#c5a880]/10 dark:from-[#c5a880]/15 dark:to-transparent text-[#c5a880] border border-[#c5a880]/25 scale-105 shadow-[0_2px_12px_rgba(197,168,128,0.12)]'
                : 'text-slate-400 dark:text-slate-500 hover:text-[#c5a880]/70 border border-transparent'
            }`}
          >
            <LayoutGrid size={18} />
          </Link>
          <Link
            to="/portal/profile"
            className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 ease-out active:scale-90 ${
              isProfile
                ? 'bg-gradient-to-r from-[#c5a880]/20 to-[#c5a880]/10 dark:from-[#c5a880]/15 dark:to-transparent text-[#c5a880] border border-[#c5a880]/25 scale-105 shadow-[0_2px_12px_rgba(197,168,128,0.12)]'
                : 'text-slate-400 dark:text-slate-500 hover:text-[#c5a880]/70 border border-transparent'
            }`}
          >
            <User size={18} />
          </Link>
        </div>
      )}
    </div>
  );
};

// Applicant-facing status -> pill colors.
export const statusPill = (outcome) =>
  outcome === 'positive'
    ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
    : outcome === 'negative'
      ? 'bg-rose-500/10 text-rose-600 border-rose-500/20'
      : 'bg-[#c5a880]/10 text-[#c5a880] border-[#c5a880]/30';

export const luxuryInput = 'w-full h-11 px-4 border text-xs tracking-wide luxury-input focus:outline-none';
export const luxuryBtn =
  'flex items-center justify-center gap-2 px-8 h-11 bg-[#1c1c1c] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#c5a880] hover:text-[#1c1c1c] text-[10px] font-medium tracking-widest uppercase rounded-none transition duration-300 cursor-pointer';

export default PortalShell;
