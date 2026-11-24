"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, ChevronDown, ChevronRight, ClipboardList, Coffee, FilePlus2, LayoutDashboard, LogOut, Mail, Menu, Settings as SettingsIcon, ShieldCheck, UserRound, X } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import ChangePasswordForm from "../../../../components/ChangePasswordForm";
import "../intake.css";

type User = { id: number; fullName: string; email: string; role: string };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();

export default function IntakeSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`${apiUrl}/api/auth/me`, { credentials: "include" });
          const result = await response.json() as { user?: User };
          if (!response.ok || !result.user) { router.replace("/"); return; }
          if (result.user.role !== "INTAKE") { router.replace(result.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/handler"); return; }
          if (active) setUser(result.user);
        } catch { if (active) setError("Unable to load your account settings."); }
        finally { if (active) setLoading(false); }
      })();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [router]);

  async function logout() {
    await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    router.replace("/");
  }

  return <div className="intake-app">
    {mobileNav && <button className="intake-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`intake-sidebar ${mobileNav ? "is-open" : ""}`}>
      <Link href="/dashboard/intake" className="intake-brand"><span className="intake-brand-icon"><Coffee size={21}/></span><span><strong>Coffee Ninja</strong><small>INQUIRY DESK</small></span><button className="intake-close" aria-label="Close menu" onClick={(event) => { event.preventDefault(); setMobileNav(false); }}><X size={18}/></button></Link>
      <div className="intake-nav-label">WORKSPACE</div><nav className="intake-nav" aria-label="Main navigation">
        <Link href="/dashboard/intake"><LayoutDashboard size={18}/>Dashboard</Link>
        <Link href="/dashboard/intake/inquiries"><ClipboardList size={18}/>My created inquiries</Link>
        <Link href="/dashboard/intake/new"><FilePlus2 size={18}/>New inquiry</Link>
        <Link href="/dashboard/intake/notifications"><Bell size={18}/>Notifications</Link>
      </nav><div className="intake-nav-label settings-label">PREFERENCES</div><nav className="intake-nav"><Link className="current" aria-current="page" href="/dashboard/intake/settings"><SettingsIcon size={18}/>Settings</Link></nav>
      <div className="intake-sidebar-profile"><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span className="intake-profile-name"><strong>{user?.fullName ?? "Intake Staff"}</strong><small>Intake Staff</small></span><button className="intake-logout" aria-label="Log out" onClick={() => void logout()}><LogOut size={17}/></button></div>
    </aside>
    <main className="intake-main">
      <header className="intake-topbar"><button className="intake-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="intake-breadcrumb"><span>Workspace</span><ChevronRight size={14}/><strong>Settings</strong></div><div className="intake-top-tools"><button className="intake-icon-button intake-bell" aria-label="Notifications"><Bell size={18}/></button><ThemeToggle className="intake-icon-button"/><div className="intake-profile-menu-wrap"><button className="intake-top-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span><strong>{user?.fullName ?? "Staff"}</strong><small>Intake Staff</small></span><ChevronDown size={15}/></button>{profileOpen && <div className="intake-profile-dropdown"><strong>{user?.fullName ?? "Staff"}</strong><small>{user?.email ?? ""}</small><button onClick={() => void logout()}><LogOut size={14}/> Log out</button></div>}</div></div></header>
      <div className="intake-content intake-settings-content"><div className="intake-heading"><div><p className="intake-kicker">PREFERENCES</p><h1>Settings</h1><p>Manage your appearance and review your account information.</p></div></div>
        {saved && <div className="new-form-success" role="status"><Check size={17}/>Your theme preference is saved on this device.</div>}
        {error && <div className="new-form-error" role="alert"><X size={16}/>{error}</div>}
        {loading ? <section className="new-form-card"><div className="intake-empty">Loading your account settings…</div></section> : <div className="settings-grid intake-settings-grid">
          <section className="management-card settings-card"><div className="settings-card-heading"><span className="settings-icon"><UserRound size={19}/></span><div><h3>Intake Staff profile</h3><p>Account information from your authenticated session.</p></div></div><dl className="settings-details"><div><dt>Full name</dt><dd>{user?.fullName ?? "—"}</dd></div><div><dt>Email address</dt><dd><Mail size={14}/>{user?.email ?? "—"}</dd></div><div><dt>Role</dt><dd><ShieldCheck size={14}/>Intake Staff</dd></div></dl></section>
          <section className="management-card settings-card"><div className="settings-card-heading"><span className="settings-icon"><ShieldCheck size={19}/></span><div><h3>Appearance</h3><p>Choose a theme for this browser.</p></div></div><div className="theme-setting"><div><strong>Light or dark theme</strong><span>Your preference is saved and restored automatically.</span></div><ThemeToggle className="intake-icon-button" onThemeChange={() => setSaved(true)}/></div><p className="settings-note">When no theme is selected, the portal follows your system preference.</p></section>
          <ChangePasswordForm />
        </div>}
      </div>
    </main>
  </div>;
}
