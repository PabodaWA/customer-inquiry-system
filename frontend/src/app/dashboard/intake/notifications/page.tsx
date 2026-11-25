"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, ChevronDown, ChevronRight, FilePlus2, LayoutDashboard, ClipboardList, LogOut, Menu, Settings, X } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import { API_BASE, apiRequest, inquiryReference, readableLabel, type ApiResult } from "../../../../lib/admin";
import { useLogout } from "../../../../lib/useLogout";
import LogoutFeedback from "../../../../components/LogoutFeedback";
import { markNotificationRead } from "../../../../lib/notificationState.mjs";
import "../intake.css";

type User = { id: number; fullName: string; email: string; role: string };
type Notification = { id: number; inquiry_id: number | null; kind: string; message: string; created_at: string; read_at: string | null };
type NoticeResult = ApiResult<Notification[]> & { unread_count?: number };
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
const dateLabel = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date); };

export default function IntakeNotificationsPage() {
  const router = useRouter();
  const { logout, error: logoutError } = useLogout();
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "READ">("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    const result = await apiRequest<Notification[]>("/api/notifications") as NoticeResult;
    setNotifications(result.data ?? []);
    setUnreadCount(result.unread_count ?? 0);
  }, []);

  async function retryLoad() {
    setLoading(true);
    setError("");
    try { await loadNotifications(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load notifications."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" });
        const result = await response.json() as { user?: User };
        if (!response.ok || !result.user) { router.replace("/"); return; }
        if (result.user.role !== "INTAKE") { router.replace(result.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/handler"); return; }
        if (active) setUser(result.user);
        await loadNotifications();
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load notifications."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void loadNotifications().catch(() => undefined); }, 10_000);
    return () => { active = false; window.clearInterval(interval); };
  }, [loadNotifications, router]);

  async function markRead(item: Notification) {
    if (item.read_at) return;
    setSaving(true); setError("");
    try {
      await apiRequest(`/api/notifications/${item.id}/read`, { method: "PATCH" });
      const readAt = new Date().toISOString();
      setNotifications((current) => markNotificationRead(current, item.id, readAt));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not mark this notification as read."); }
    finally { setSaving(false); }
  }
  async function markAllRead() {
    const unread = notifications.filter((item) => !item.read_at);
    if (!unread.length) return;
    setSaving(true); setError("");
    try {
      await Promise.all(unread.map((item) => apiRequest(`/api/notifications/${item.id}/read`, { method: "PATCH" })));
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
      setUnreadCount(0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not mark all notifications as read."); await loadNotifications().catch(() => undefined); }
    finally { setSaving(false); }
  }

  const filtered = useMemo(() => notifications.filter((item) => filter === "ALL" || (filter === "UNREAD" ? !item.read_at : Boolean(item.read_at))), [notifications, filter]);

  return <div className="intake-app">
    <LogoutFeedback error={logoutError} onRetry={() => void logout()}/>
    {mobileNav && <button className="intake-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`intake-sidebar ${mobileNav ? "is-open" : ""}`}>
      <Link href="/dashboard/intake" className="intake-brand"><span className="intake-brand-icon"><img src="/cofee.png" alt="" /></span><span><small>INQUIRY PORTAL</small></span><button className="intake-close" aria-label="Close menu" onClick={(event) => { event.preventDefault(); setMobileNav(false); }}><X size={18}/></button></Link>
      <div className="intake-nav-label">WORKSPACE</div><nav className="intake-nav" aria-label="Main navigation">
        <Link href="/dashboard/intake"><LayoutDashboard size={18}/>Dashboard</Link><Link href="/dashboard/intake/inquiries"><ClipboardList size={18}/>My created inquiries</Link><Link href="/dashboard/intake/new"><FilePlus2 size={18}/>New inquiry</Link><Link className="current" aria-current="page" href="/dashboard/intake/notifications"><Bell size={18}/>Notifications{unreadCount > 0 && <span className="intake-nav-unread">{unreadCount > 9 ? "9+" : unreadCount}</span>}</Link>
      </nav><div className="intake-nav-label settings-label">PREFERENCES</div><nav className="intake-nav"><Link href="/dashboard/intake/settings"><Settings size={18}/>Settings</Link></nav>
      <div className="intake-sidebar-profile"><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span className="intake-profile-name"><strong>{user?.fullName ?? "Intake Staff"}</strong><small>Intake Staff</small></span><button className="intake-logout" aria-label="Log out" onClick={() => void logout()}><LogOut size={17}/></button></div>
    </aside>
    <main className="intake-main">
      <header className="intake-topbar"><button className="intake-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="intake-breadcrumb"><Link href="/dashboard/intake">Workspace</Link><ChevronRight size={14}/><strong>Notifications</strong></div><div className="intake-top-tools"><ThemeToggle className="intake-icon-button"/><div className="intake-profile-menu-wrap"><button className="intake-top-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span><strong>{user?.fullName ?? "Staff"}</strong><small>Intake Staff</small></span><ChevronDown size={15}/></button>{profileOpen && <div className="intake-profile-dropdown"><strong>{user?.fullName ?? "Staff"}</strong><small>{user?.email ?? ""}</small><button onClick={() => { setProfileOpen(false); void logout(); }}><LogOut size={14}/> Log out</button></div>}</div></div></header>
      <div className="intake-content intake-notifications-content">
        <div className="intake-heading"><div><p className="intake-kicker">INBOX</p><h1>Notifications</h1><p>Updates about inquiries you submitted and their progress.</p></div><Link className="intake-create" href="/dashboard/intake/inquiries"><ClipboardList size={16}/>My inquiries</Link></div>
        {error && <div className="new-form-error" role="alert"><X size={16}/>{error}<button onClick={() => void retryLoad()}>Retry</button></div>}
        <section className="intake-notifications-card"><header className="intake-notifications-toolbar"><div className="intake-notification-filters" aria-label="Filter notifications">{(["ALL", "UNREAD", "READ"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{readableLabel(value)}{value === "UNREAD" && unreadCount > 0 && <span>{unreadCount}</span>}</button>)}</div><button className="intake-mark-all" onClick={() => void markAllRead()} disabled={saving || unreadCount === 0}><CheckCheck size={15}/>Mark all as read</button></header>
          {loading ? <div className="intake-empty">Loading notificationsâ€¦</div> : filtered.length === 0 ? <div className="intake-notifications-empty"><span><Bell size={22}/></span><strong>{filter === "UNREAD" ? "Youâ€™re all caught up" : "No notifications yet"}</strong><p>{filter === "UNREAD" ? "New inquiry updates will show here." : "Updates about your submitted inquiries will show here."}</p></div> : <div className="intake-notification-list">{filtered.map((item) => <article key={item.id} className={`intake-notification-card${item.read_at ? " is-read" : " is-unread"}`}><span className="intake-notification-status" aria-hidden="true"/><div className="intake-notification-copy"><div className="intake-notification-meta"><span>{readableLabel(item.kind)}</span><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div><p>{item.message}</p>{item.inquiry_id && <Link href="/dashboard/intake/inquiries" className="intake-notification-inquiry">Inquiry {inquiryReference(item.inquiry_id)} <ChevronRight size={14}/></Link>}</div>{!item.read_at && <button className="intake-mark-read" onClick={() => void markRead(item)} disabled={saving}><Check size={15}/>Mark read</button>}</article>)}</div>}
        </section>
      </div>
    </main>
  </div>;
}
