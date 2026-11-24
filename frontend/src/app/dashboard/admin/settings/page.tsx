"use client";

import { useState } from "react";
import { Check, Mail, ShieldCheck, UserRound } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import { useAdminLayout } from "../../../../components/AdminLayout";

export default function AdminSettingsPage() {
  const { user } = useAdminLayout();
  const [saved, setSaved] = useState(false);
  return <div className="page-content management-page">
    <div className="management-heading"><div><p className="eyebrow"><span className="eyebrow-dot"/> PREFERENCES</p><h2>Settings</h2><p>Manage your appearance and review your account information.</p></div></div>
    {saved && <div className="feedback success-feedback" role="status"><Check size={16}/>Your theme preference is saved on this device.</div>}
    <div className="settings-grid">
      <section className="management-card settings-card"><div className="settings-card-heading"><span className="settings-icon"><UserRound size={19}/></span><div><h3>Admin profile</h3><p>Account information from your authenticated session.</p></div></div><dl className="settings-details"><div><dt>Full name</dt><dd>{user.fullName}</dd></div><div><dt>Email address</dt><dd><Mail size={14}/>{user.email}</dd></div><div><dt>Role</dt><dd><ShieldCheck size={14}/>Administrator</dd></div></dl><p className="settings-note">Profile editing and password changes aren’t supported by the current authentication API.</p></section>
        <section className="management-card settings-card"><div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={19}/></span><div><h3>Appearance</h3><p>Choose a theme for this browser.</p></div></div><div className="theme-setting"><div><strong>Light or dark theme</strong><span>Your preference is saved and restored automatically.</span></div><ThemeToggle className="icon-button" onThemeChange={() => setSaved(true)} /></div><p className="settings-note">When no theme is selected, the portal follows your system preference.</p></section>
    </div>
  </div>;
}
