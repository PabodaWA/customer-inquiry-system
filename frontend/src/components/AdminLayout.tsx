"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, ChevronDown, ChevronRight, ClipboardList, Coffee, LayoutDashboard, LogOut,
  PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Tags,
  Users, X, UserRoundX,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

type AdminUser = { id?: number; fullName: string; email: string; role: "ADMIN" };
type AdminLayoutContextValue = { user: AdminUser; search: string; setSearch: (value: string) => void };

const AdminLayoutContext = createContext<AdminLayoutContextValue | null>(null);
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

const navigation = [
  { label: "Dashboard", href: "/dashboard/admin", icon: LayoutDashboard },
  { label: "All inquiries", href: "/dashboard/admin/inquiries", icon: ClipboardList },
  { label: "Declined inquiries", href: "/dashboard/admin/declined", icon: UserRoundX },
  { label: "Staff management", href: "/dashboard/admin/staff", icon: Users },
  { label: "Category management", href: "/dashboard/admin/categories", icon: Tags },
  { label: "Notifications", href: "/dashboard/admin/notifications", icon: Bell },
];

function getPageTitle(pathname: string) {
  const pages: Record<string, string> = {
    "/dashboard/admin": "Dashboard",
    "/dashboard/admin/inquiries": "All inquiries",
    "/dashboard/admin/notifications": "Notifications",
    "/dashboard/admin/staff": "Staff management",
    "/dashboard/admin/categories": "Category management",
    "/dashboard/admin/declined": "Declined inquiries",
    "/dashboard/admin/settings": "Settings",
  };
  return pages[pathname] ?? "Dashboard";
}

function nameInitials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

export function useAdminLayout() {
  const value = useContext(AdminLayoutContext);
  if (!value) throw new Error("useAdminLayout must be used inside AdminLayout.");
  return value;
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const title = getPageTitle(pathname);

  useEffect(() => {
    let active = true;
    async function loadUser() {
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`, { credentials: "include" });
        const result = await response.json() as { user?: { id?: number; fullName?: string; email?: string; role?: string } };
        if (!response.ok || !result.user) { router.replace("/"); return; }
        if (result.user.role !== "ADMIN") {
          const paths: Record<string, string> = { INTAKE: "/dashboard/intake", HANDLER: "/dashboard/handler" };
          router.replace(paths[result.user.role ?? ""] ?? "/");
          return;
        }
        if (active) setUser({ id: result.user.id, fullName: result.user.fullName ?? "Administrator", email: result.user.email ?? "", role: "ADMIN" });
      } catch {
        router.replace("/");
      } finally {
        if (active) setAuthLoading(false);
      }
    }
    void loadUser();
    return () => { active = false; };
  }, [router]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileToggleRef.current?.focus();
      } else if (event.key === "Tab") {
        const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    sidebarRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const contextValue = useMemo(() => user ? { user, search, setSearch } : null, [user, search]);

  async function logout() {
    try { await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" }); }
    finally { router.replace("/"); }
  }

  function closeMobileNav() {
    setMobileOpen(false);
    mobileToggleRef.current?.focus();
  }

  if (authLoading || !user || !contextValue) {
    return <main className="dashboard-loading-screen" aria-live="polite">Loading admin workspace…</main>;
  }

  return (
    <AdminLayoutContext.Provider value={contextValue}>
      <div className={`admin-app${collapsed ? " sidebar-collapsed" : ""}`}>
        {mobileOpen && <button className="mobile-nav-backdrop" aria-label="Close navigation" onClick={closeMobileNav} />}
        <aside id="admin-sidebar" ref={sidebarRef} className={`sidebar${mobileOpen ? " sidebar-open" : ""}`} aria-label="Admin sidebar" role={mobileOpen ? "dialog" : undefined} aria-modal={mobileOpen || undefined}>
          <div className="brand-row">
            <Link className="brand-icon" href="/dashboard/admin" aria-label="Coffee Ninja dashboard"><Coffee size={21} strokeWidth={2.4} /></Link>
            <span className="brand-copy"><small>INQUIRY PORTAL</small></span>
            <button className="icon-button mobile-close" onClick={closeMobileNav} aria-label="Close navigation"><X size={18}/></button>
          </div>
          <div className="workspace-label">WORKSPACE</div>
          <nav className="side-nav" aria-label="Admin navigation">
            {navigation.map(({ label, href, icon: Icon }) => {
              const active = href === pathname;
              return <Link key={label} className={`side-link${active ? " selected" : ""}`} href={href} aria-label={label} aria-current={active ? "page" : undefined} onClick={() => { if (mobileOpen) closeMobileNav(); }}><Icon size={18}/><span>{label}</span>{active && <span className="nav-indicator"/>}</Link>;
            })}
          </nav>
          <div className="side-divider"/>
          <Link className={`side-link${pathname === "/dashboard/admin/settings" ? " selected" : ""}`} href="/dashboard/admin/settings" onClick={() => { if (mobileOpen) closeMobileNav(); }}><Settings size={18}/><span>Settings</span></Link>
          <div className="sidebar-bottom">
            <button className="logout-link" onClick={logout}><LogOut size={18}/><span>Log out</span></button>
            <div className="sidebar-foot"><ShieldCheck size={14}/> <span>Secure workspace</span></div>
          </div>
        </aside>

        <section className="main-area">
          <header className="topbar">
            <button ref={toggleRef} className="icon-button sidebar-toggle" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} aria-controls="admin-sidebar">{collapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button>
            <button ref={mobileToggleRef} className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="admin-sidebar"><PanelLeftOpen size={20}/></button>
            <div className="header-title"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><strong>{title}</strong></div><h1>{title}</h1></div>
            <div className="topbar-actions">
              <label className="search-box"><span className="sr-only">Search inquiries</span><input aria-label="Search inquiries" placeholder="Search inquiries..." value={search} onChange={(event) => setSearch(event.target.value)}/><kbd>/</kbd></label>
              <ThemeToggle className="icon-button theme-button" />
              <div className="profile-wrap">
                <button className="profile-button" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-haspopup="menu"><span className="avatar">{nameInitials(user.fullName)}</span><span className="profile-text"><strong>{user.fullName}</strong><small>Administrator</small></span><ChevronDown size={15}/></button>
                {profileOpen && <div className="profile-menu" role="menu"><strong>{user.email}</strong><button role="menuitem" onClick={logout}><LogOut size={15}/>Log out</button></div>}
              </div>
            </div>
          </header>
          <main className="admin-content">{children}</main>
        </section>
      </div>
    </AdminLayoutContext.Provider>
  );
}
