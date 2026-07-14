import React from 'react';
import { Link } from 'react-router-dom';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import { LogOut, LayoutGrid, Briefcase } from 'lucide-react';

// Shared branded frame for every careers-portal page (matches the public
// Careers/Apply luxury theme).
const PortalShell = ({ children, wide = false }) => {
  const { applicant, logout } = useApplicantAuth();
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
                  <Link to="/portal/dashboard" className="text-[9px] tracking-[0.15em] text-slate-500 hover:text-[#c5a880] uppercase font-semibold inline-flex items-center gap-1">
                    <LayoutGrid size={11} /> My Applications
                  </Link>
                  <button onClick={logout} className="text-[9px] tracking-[0.15em] text-slate-500 hover:text-[#c5a880] uppercase font-semibold inline-flex items-center gap-1">
                    <LogOut size={11} /> Sign out
                  </button>
                </>
              ) : (
                <Link to="/portal/login" className="text-[9px] tracking-[0.15em] text-[#c5a880] uppercase font-semibold">
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </header>
        <div className={`${wide ? 'max-w-6xl' : 'max-w-5xl'} mx-auto px-5 py-10`}>{children}</div>
      </div>
      <footer className="text-center text-[9px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-600 border-t luxury-border-thin py-10 max-w-5xl mx-auto w-full">
        &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
      </footer>
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
