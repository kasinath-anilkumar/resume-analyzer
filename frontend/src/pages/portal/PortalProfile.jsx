import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApplicantAuth } from '../../context/ApplicantAuthContext';
import portalApi from '../../services/portalApi';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import PortalShell, { luxuryInput, luxuryBtn } from './PortalShell';
import LocationSearchInput from '../../components/LocationSearchInput';
import {
  ChevronLeft, User, Mail, Phone, Link2, CheckCircle2, Lock,
  Settings, Globe, Shield, UploadCloud, FileText, Trash2, Loader2, MapPin
} from 'lucide-react';

const PortalProfile = () => {
  const { applicant, refreshProfile } = useApplicantAuth();

  // Navigation tabs: 'personal', 'professional', 'security'
  const [activeTab, setActiveTab] = useState('personal');

  // Form states — seeded from the signed-in applicant, then hydrated from the API.
  const [name, setName] = useState(applicant?.name || '');
  const [email, setEmail] = useState(applicant?.email || '');
  const [phone, setPhone] = useState(applicant?.phone || '');
  const [location, setLocation] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [portfolio, setPortfolio] = useState('');
  const [bio, setBio] = useState('');

  // { name, url } when a primary résumé is on file, else null.
  const [resumeFile, setResumeFile] = useState(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [originalProfile, setOriginalProfile] = useState(null);

  // Load the real profile once on mount.
  useEffect(() => {
    portalApi.get('/me')
      .then((res) => {
        if (res.data.success) {
          const p = res.data;
          setName(p.name || '');
          setEmail(p.email || '');
          setPhone(p.phone || '');
          setLocation(p.location || '');
          setLinkedin(p.linkedinUrl || '');
          setPortfolio(p.portfolioUrl || '');
          setBio(p.bio || '');
          setResumeFile(p.resumeUrl ? { name: 'Your résumé on file', url: p.resumeUrl } : null);
          setOriginalProfile({
            name: p.name || '',
            phone: p.phone || '',
            location: p.location || '',
            linkedinUrl: p.linkedinUrl || '',
            portfolioUrl: p.portfolioUrl || '',
            bio: p.bio || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  // Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Feedback alerts
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [saving, setSaving] = useState(false);

  const [profileError, setProfileError] = useState('');

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (phone && !isValidPhoneNumber(phone)) { setProfileSuccess(''); setProfileError('Please enter a valid phone number.'); return; }
    setSaving(true);
    setProfileSuccess('');
    setProfileError('');
    try {
      const res = await portalApi.put('/me', {
        name: name.trim(),
        phone: (phone || '').trim(),
        location: location.trim(),
        linkedinUrl: linkedin.trim(),
        portfolioUrl: portfolio.trim(),
        bio: bio.trim(),
      });
      if (res.data.success) {
        setProfileSuccess('Profile changes saved successfully.');
        setOriginalProfile({
          name: name.trim(),
          phone: (phone || '').trim(),
          location: location.trim(),
          linkedinUrl: linkedin.trim(),
          portfolioUrl: portfolio.trim(),
          bio: bio.trim(),
        });
        refreshProfile(); // keep the portal header name in sync
      } else {
        setProfileError(res.data.message || 'Could not save your profile.');
      }
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleResumeChange = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setProfileSuccess('');
      setProfileError(`Résumé is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Please upload a file under 10 MB.`);
      return;
    }
    setUploadingResume(true);
    setProfileError('');
    try {
      const fd = new FormData();
      fd.append('resume', file);
      const res = await portalApi.post('/resume', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.success) {
        setResumeFile({ name: res.data.data.name || file.name, url: res.data.data.resumeUrl });
        setProfileSuccess('Résumé uploaded.');
      } else {
        setProfileError(res.data.message || 'Could not upload your résumé.');
      }
    } catch (err) {
      setProfileError(err.response?.data?.message || 'Could not upload your résumé.');
    } finally {
      setUploadingResume(false);
    }
  };

  const handleResumeRemove = async () => {
    try {
      await portalApi.put('/me', { resumeUrl: '' });
      setResumeFile(null);
    } catch { /* ignore */ }
  };

  // Résumés live in a private bucket — fetch a short-lived signed URL on demand.
  const openResume = async () => {
    try {
      const res = await portalApi.get('/me/resume-url');
      if (res.data?.url) window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } catch { /* résumé unavailable */ }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      const res = await portalApi.post('/change-password', { currentPassword, newPassword });
      if (res.data.success) {
        setPasswordSuccess('Password updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setPasswordError(res.data.message || 'Could not change your password.');
      }
    } catch (err) {
      setPasswordError(err.response?.data?.message || 'Could not change your password.');
    } finally {
      setSaving(false);
    }
  };

  const isContactDirty = () => {
    if (!originalProfile) return false;
    return (
      name.trim() !== originalProfile.name ||
      (phone || '').trim() !== originalProfile.phone ||
      location.trim() !== originalProfile.location
    );
  };

  const isProfessionalDirty = () => {
    if (!originalProfile) return false;
    return (
      linkedin.trim() !== originalProfile.linkedinUrl ||
      portfolio.trim() !== originalProfile.portfolioUrl ||
      bio.trim() !== originalProfile.bio
    );
  };

  return (
    <PortalShell>
      {/* Back Link */}
      {/* <Link to="/portal/dashboard" className="inline-flex items-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 hover:text-[#c5a880] mb-6 transition-colors duration-200">
        <ChevronLeft size={14} className="mr-1 text-[#c5a880]" /> Back to Dashboard
      </Link> */}

      {/* Main Grid Container */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 bg-white/80 dark:bg-[#151210]/80 border luxury-border-thin rounded-none overflow-hidden shadow-sm">

        {/* Left Side: Brand Passport & Tab Selector (Col Span 4) */}
        <div className="hidden lg:flex lg:col-span-4 bg-[#1c1c1c] text-white p-6 md:p-8 flex flex-col justify-between border-r luxury-border-thin relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 bg-[radial-gradient(#c5a880_1px,transparent_1px)] [background-size:16px_16px]"></div>

          <div className="relative z-10 space-y-8">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <img
                src="https://parakkatjewels.com/cdn/shop/files/Logo.png?v=1711363419&width=96"
                alt="Parakkat Jewels Logo"
                className="h-10 w-auto object-contain brightness-100 dark:brightness-95"
              />
              <span className="font-luxury font-medium tracking-[0.2em] text-xs uppercase border-l luxury-border-thin pl-3 text-[#e2d1c5]">
                Profile
              </span>
            </div>

            {/* Passport Identity card */}
            <div className="text-center py-6 border-y border-white/5 space-y-4">
              <div className="w-16 h-16 mx-auto border-2 border-[#c5a880] bg-white/5 flex items-center justify-center text-xl font-light tracking-widest text-[#c5a880]">
                {name ? name.charAt(0).toUpperCase() : 'A'}
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-widest text-[#e2d1c5]">{name}</h3>
                <span className="text-[8px] tracking-[0.25em] text-slate-500 uppercase font-bold block">Applicant Member</span>
              </div>
            </div>

            {/* Luxury Navigation Tab Menu */}
            <nav className="flex flex-col space-y-1">
              <button
                type="button"
                onClick={() => { setActiveTab('personal'); setProfileSuccess(''); setPasswordError(''); setPasswordSuccess(''); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-[10px] tracking-widest uppercase font-semibold transition-all duration-300 rounded-none border-l-2 text-left ${activeTab === 'personal'
                    ? 'border-[#c5a880] bg-[#c5a880]/10 text-white'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <User size={13} className={activeTab === 'personal' ? 'text-[#c5a880]' : 'text-slate-400'} />
                <span>Personal Info</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('professional'); setProfileSuccess(''); setPasswordError(''); setPasswordSuccess(''); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-[10px] tracking-widest uppercase font-semibold transition-all duration-300 rounded-none border-l-2 text-left ${activeTab === 'professional'
                    ? 'border-[#c5a880] bg-[#c5a880]/10 text-white'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Globe size={13} className={activeTab === 'professional' ? 'text-[#c5a880]' : 'text-slate-400'} />
                <span>Resume & Web Links</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('security'); setProfileSuccess(''); setPasswordError(''); setPasswordSuccess(''); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-[10px] tracking-widest uppercase font-semibold transition-all duration-300 rounded-none border-l-2 text-left ${activeTab === 'security'
                    ? 'border-[#c5a880] bg-[#c5a880]/10 text-white'
                    : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
              >
                <Shield size={13} className={activeTab === 'security' ? 'text-[#c5a880]' : 'text-slate-400'} />
                <span>Security Settings</span>
              </button>
            </nav>
          </div>

          <div className="text-[8px] tracking-widest uppercase text-slate-500 pt-10 relative z-10 border-t border-white/5 mt-8 lg:mt-0">
            &copy; {new Date().getFullYear()} PARAKKAT JEWELS. All rights reserved.
          </div>
        </div>

        {/* Right Side: Tab Panel Content (Col Span 8) */}
        <div className="lg:col-span-8 p-6 md:p-8 flex flex-col justify-center bg-white/60 dark:bg-black/10">

          {/* Mobile Horizontal Tabs Selector */}
          <div className="lg:hidden border-b luxury-border-thin flex justify-around mb-6 bg-slate-50 dark:bg-black/20 p-1">
            <button
              type="button"
              onClick={() => { setActiveTab('personal'); setProfileSuccess(''); setPasswordError(''); setPasswordSuccess(''); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[8px] tracking-widest uppercase font-semibold border-b-2 transition-all duration-300 ${activeTab === 'personal'
                  ? 'border-[#c5a880] text-[#c5a880]'
                  : 'border-transparent text-slate-400'
                }`}
            >
              <User size={13} className={activeTab === 'personal' ? 'text-[#c5a880]' : 'text-slate-400'} />
              <span>Personal</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('professional'); setProfileSuccess(''); setPasswordError(''); setPasswordSuccess(''); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[8px] tracking-widest uppercase font-semibold border-b-2 transition-all duration-300 ${activeTab === 'professional'
                  ? 'border-[#c5a880] text-[#c5a880]'
                  : 'border-transparent text-slate-400'
                }`}
            >
              <Globe size={13} className={activeTab === 'professional' ? 'text-[#c5a880]' : 'text-slate-400'} />
              <span>Resume/Links</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('security'); setProfileSuccess(''); setPasswordError(''); setPasswordSuccess(''); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2 text-[8px] tracking-widest uppercase font-semibold border-b-2 transition-all duration-300 ${activeTab === 'security'
                  ? 'border-[#c5a880] text-[#c5a880]'
                  : 'border-transparent text-slate-400'
                }`}
            >
              <Shield size={13} className={activeTab === 'security' ? 'text-[#c5a880]' : 'text-slate-400'} />
              <span>Security</span>
            </button>
          </div>

          {/* TAB 1: Personal Info */}
          {activeTab === 'personal' && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
                  Personal Credentials
                </h3>
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">
                  Update your contact and identification settings.
                </p>
              </div>

              {profileSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 rounded-none tracking-wide">
                  <CheckCircle2 size={14} /> {profileSuccess}
                </div>
              )}
              {profileError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-none tracking-wide">
                  {profileError}
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Full Name *</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                    <input
                      required
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={luxuryInput}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Email Address *</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3.5 top-3.5 text-slate-400" />
                    <input
                      disabled
                      type="email"
                      value={email}
                      className="w-full h-11 pl-10 pr-4 border text-xs tracking-wide luxury-input bg-slate-50 dark:bg-black/20 text-slate-400 cursor-not-allowed focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Phone Number</label>
                  <PhoneInput
                    defaultCountry="IN"
                    value={phone || undefined}
                    onChange={(v) => setPhone(v || '')}
                    className={`luxury-phone ${phone && !isValidPhoneNumber(phone) ? 'luxury-phone-error' : ''}`}
                    placeholder="90000 00000"
                  />
                  {phone && !isValidPhoneNumber(phone) && (
                    <span className="text-[9px] text-rose-500 uppercase tracking-widest">Enter a valid phone number</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Current Location</label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3.5 top-3.5 text-[#c5a880] z-10" />
                    <LocationSearchInput
                      value={location}
                      onChange={(val) => setLocation(val)}
                      placeholder="Start typing your city…"
                      className="w-full h-11 pl-10 pr-4 border text-xs tracking-wide luxury-input focus:outline-none"
                    />
                  </div>
                </div>

                {isContactDirty() && (
                  <button type="submit" disabled={saving} className={`${luxuryBtn} w-full mt-2 animate-in fade-in zoom-in duration-200`}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save Contact Details'}
                  </button>
                )}
              </form>
            </div>
          )}

          {/* TAB 2: Resume & Web Links */}
          {activeTab === 'professional' && (
            <div className="space-y-4 animate-fadeIn">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
                  Professional Attachments & Links
                </h3>
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">
                  Provide screening attachments and professional social handles.
                </p>
              </div>

              {profileSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2 rounded-none tracking-wide">
                  <CheckCircle2 size={14} /> {profileSuccess}
                </div>
              )}
              {profileError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-none tracking-wide">
                  {profileError}
                </div>
              )}

              <form onSubmit={handleProfileSubmit} className="space-y-3.5">

                {/* Resume display block */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase block">Primary Résumé</label>
                  {resumeFile ? (
                    <div className="p-3 border luxury-border-thin flex items-center justify-between bg-white dark:bg-black/10">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 border luxury-border-thin bg-[#c5a880]/10 flex items-center justify-center text-[#c5a880]">
                          <FileText size={18} />
                        </div>
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wide block truncate max-w-[200px] sm:max-w-xs">{resumeFile.name}</span>
                          {resumeFile.url && (
                            <button type="button" onClick={openResume} className="text-[8.5px] text-[#c5a880] uppercase tracking-widest block mt-0.5 hover:underline">View résumé</button>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleResumeRemove}
                        className="p-2 border luxury-border-thin text-slate-400 hover:text-rose-500 hover:border-rose-500/20 hover:bg-rose-500/5 transition-all duration-300"
                        title="Remove resume"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-[#c5a880] rounded-none cursor-pointer transition-all duration-300">
                      {uploadingResume ? <Loader2 size={22} className="text-[#c5a880] mb-2 animate-spin" /> : <UploadCloud size={22} className="text-[#c5a880] mb-2" />}
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{uploadingResume ? 'Uploading…' : 'Attach Primary Résumé'}</span>
                      <span className="text-[8px] text-slate-400 uppercase tracking-widest mt-1">PDF, DOC, DOCX, IMAGE (MAX 10MB)</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.txt,.rtf,image/*"
                        className="hidden"
                        disabled={uploadingResume}
                        onChange={(e) => handleResumeChange(e.target.files?.[0])}
                      />
                    </label>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">LinkedIn Profile Link</label>
                  <div className="relative">
                    <Link2 size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                    <input
                      type="url"
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      placeholder="https://linkedin.com/in/username"
                      className={luxuryInput}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Portfolio Website URL</label>
                  <div className="relative">
                    <Link2 size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                    <input
                      type="url"
                      value={portfolio}
                      onChange={(e) => setPortfolio(e.target.value)}
                      placeholder="https://mywebsite.com"
                      className={luxuryInput}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Professional Summary (Bio)</label>
                  <textarea
                    rows="3"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe your visual style or operations philosophy..."
                    className="w-full p-3 border text-xs tracking-wide luxury-input focus:outline-none resize-none"
                  />
                </div>

                {isProfessionalDirty() && (
                  <button type="submit" disabled={saving} className={`${luxuryBtn} w-full mt-1 animate-in fade-in zoom-in duration-200`}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : 'Save Professional Details'}
                  </button>
                )}
              </form>
            </div>
          )}

          {/* TAB 3: Security Settings */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-[0.15em] text-[#1c1c1c] dark:text-[#f5efe9]">
                  Account Security Settings
                </h3>
                <p className="text-[9px] uppercase tracking-widest text-slate-400 mt-0.5">
                  Update and verify password protection options.
                </p>
              </div>

              {passwordError && (
                <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs rounded-none tracking-wide">
                  {passwordError}
                </div>
              )}

              {passwordSuccess && (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs rounded-none tracking-wide">
                  {passwordSuccess}
                </div>
              )}

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Current Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                    <input
                      required
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className={luxuryInput}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">New Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                    <input
                      required
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="MIN 6 CHARS"
                      className={luxuryInput}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-semibold tracking-widest text-slate-400 uppercase">Confirm Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3.5 top-3.5 text-[#c5a880]" />
                    <input
                      required
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="REPEAT NEW PASSWORD"
                      className={luxuryInput}
                    />
                  </div>
                </div>

                {(currentPassword || newPassword || confirmPassword) && (
                  <button type="submit" disabled={saving} className={`${luxuryBtn} w-full mt-2 animate-in fade-in zoom-in duration-200`}>
                    {saving ? <Loader2 size={14} className="animate-spin" /> : 'Change Password'}
                  </button>
                )}
              </form>
            </div>
          )}

        </div>

      </div>
    </PortalShell>
  );
};

// Wrapping in PortalProfile requires standard layout, but since we already use PortalShell
// we can export default directly.
export default PortalProfile;
