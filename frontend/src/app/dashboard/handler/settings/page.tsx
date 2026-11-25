"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Coffee, Mail, ShieldCheck, UserRound } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import ChangePasswordForm from "../../../../components/ChangePasswordForm";
import { API_BASE } from "../../../../lib/admin";

type User = { fullName: string; email: string; role: string; specialization?: string };

export default function HandlerSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void fetch(`${API_BASE}/api/auth/me`, { credentials: "include" }).then(async (response) => {
        const result = await response.json() as { user?: User };
        if (!response.ok || !result.user) { router.replace("/"); return; }
        if (result.user.role !== "HANDLER") { router.replace(result.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/intake"); return; }
        if (active) setUser(result.user);
      }).catch(() => { if (active) setError("Unable to load your account settings."); }).finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [router]);

  return <main className="handler-shell"><aside className="handler-sidebar"><div className="handler-brand"><span className="handler-brand-mark"><Coffee size={21}/></span><div><small>INQUIRY PORTAL</small></div></div><p className="handler-nav-label">WORKSPACE</p><nav className="handler-nav"><Link className="handler-nav-link" href="/dashboard/handler"><ArrowLeft/>Dashboard</Link><span className="handler-nav-current"><ShieldCheck/>Settings</span></nav></aside>
    <section className="handler-main"><header className="handler-topbar"><div><p>HANDLER WORKSPACE</p><h1>Settings</h1></div><Link className="handler-settings-back" href="/dashboard/handler">Back to dashboard</Link></header><div className="handler-settings-content"><div className="handler-settings-heading"><span className="handler-kicker">PREFERENCES</span><h2>Manage your account</h2><p>Review your profile and adjust the portal appearance.</p></div>
      {saved && <div className="handler-feedback handler-success" role="status">Theme preference saved on this device.</div>}{error && <div className="handler-feedback handler-error" role="alert">{error}</div>}
      {loading ? <div className="handler-empty">Loading account settings...</div> : <div className="handler-settings-grid"><section className="handler-settings-card"><div className="handler-settings-card-title"><span><UserRound/></span><div><h3>Handler profile</h3><p>Account details from your authenticated session.</p></div></div><dl><div><dt>Full name</dt><dd>{user?.fullName ?? "-"}</dd></div><div><dt>Email address</dt><dd><Mail size={14}/>{user?.email ?? "-"}</dd></div><div><dt>Role</dt><dd><ShieldCheck size={14}/>Handler</dd></div><div><dt>Specialization</dt><dd>{user?.specialization ?? "General"}</dd></div></dl></section><section className="handler-settings-card"><div className="handler-settings-card-title"><span><ShieldCheck/></span><div><h3>Appearance</h3><p>Choose a theme for this browser.</p></div></div><div className="handler-theme-setting"><div><strong>Light or dark theme</strong><small>Your preference is saved and restored automatically.</small></div><ThemeToggle className="handler-theme" onThemeChange={() => setSaved(true)}/></div><p>The portal follows your system preference until you choose a theme.</p></section><ChangePasswordForm variant="handler"/></div>}</div></section></main>;
}
