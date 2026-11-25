"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, ChevronRight, ClipboardList, Coffee, LogOut } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import { API_BASE, apiRequest, inquiryReference, readableLabel, type ApiResult } from "../../../../lib/admin";
import { useLogout } from "../../../../lib/useLogout";
import LogoutFeedback from "../../../../components/LogoutFeedback";
import { markNotificationRead } from "../../../../lib/notificationState.mjs";

type User = { fullName: string; email: string; role: string; specialization?: string };
type Notification = { id: number; inquiry_id: number | null; kind: string; message: string; created_at: string; read_at: string | null };
type NoticeResult = ApiResult<Notification[]> & { unread_count?: number };
type Filter = "ALL" | "UNREAD" | "READ";

const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
};

export default function HandlerNotificationsPage() {
  const router = useRouter();
  const { logout, error: logoutError } = useLogout();
  const [user, setUser] = useState<User | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
        if (result.user.role !== "HANDLER") { router.replace(result.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/intake"); return; }
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
  const initials = (user?.fullName ?? "Handler").split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();

  return <main className="handler-shell">
    <LogoutFeedback error={logoutError} onRetry={() => void logout()}/>
    <aside className="handler-sidebar">
      <div className="handler-brand"><span className="handler-brand-mark"><Coffee size={21}/></span><div><small>INQUIRY PORTAL</small></div></div>
      <p className="handler-nav-label">WORKSPACE</p>
      <nav className="handler-nav" aria-label="Handler navigation">
        <Link className="handler-nav-link" href="/dashboard/handler"><ClipboardList/>Dashboard</Link>
        <Link className="handler-nav-current" href="/dashboard/handler/notifications" aria-current="page"><Bell/>Notifications{unreadCount > 0 && <span className="handler-nav-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}</Link>
      </nav>
      <div className="handler-sidebar-bottom"><div className="handler-profile"><span>{initials}</span><div><strong>{user?.fullName ?? "Handler"}</strong><small>{user?.specialization ? `${readableLabel(user.specialization)} specialist` : "Handler"}</small></div></div><button className="handler-logout" onClick={() => void logout()}><LogOut/>Log out</button></div>
    </aside>
    <section className="handler-main">
      <header className="handler-topbar"><div><p>HANDLER WORKSPACE</p><h1>Notifications</h1></div><div className="handler-top-actions"><ThemeToggle className="handler-theme"/><Link className="handler-notification-back" href="/dashboard/handler">Back to dashboard</Link></div></header>
      <div className="handler-notifications-content">
        <div className="handler-notifications-heading"><div><span className="handler-kicker">INBOX</span><h2>Your notifications</h2><p>Updates about assignments and inquiries you handle.</p></div><button className="handler-mark-all" onClick={() => void markAllRead()} disabled={saving || unreadCount === 0}><CheckCheck/>Mark all as read</button></div>
        {error && <div className="handler-feedback handler-error" role="alert">{error}<button onClick={() => void retryLoad()}>Retry</button></div>}
        <section className="handler-notifications-card">
          <header className="handler-notifications-toolbar"><div className="handler-notification-filters" aria-label="Filter notifications">{(["ALL", "UNREAD", "READ"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{readableLabel(value)}{value === "UNREAD" && unreadCount > 0 && <span>{unreadCount}</span>}</button>)}</div><span>{unreadCount} unread</span></header>
          {loading ? <div className="handler-empty">Loading notifications...</div> : filtered.length === 0 ? <div className="handler-notifications-empty"><span><Bell/></span><strong>{filter === "UNREAD" ? "You’re all caught up" : "No notifications yet"}</strong><p>{filter === "UNREAD" ? "New assignment updates will show here." : "Updates about inquiries assigned to you will show here."}</p></div> : <div className="handler-notification-list">{filtered.map((item) => <article key={item.id} className={`handler-notification-card${item.read_at ? " is-read" : " is-unread"}`}><span className="handler-notification-status" aria-hidden="true"/><div className="handler-notification-copy"><div className="handler-notification-meta"><span>{readableLabel(item.kind)}</span><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div><p>{item.message}</p>{item.inquiry_id && <Link href="/dashboard/handler" className="handler-notification-inquiry">Inquiry {inquiryReference(item.inquiry_id)} <ChevronRight/></Link>}</div>{!item.read_at && <button className="handler-mark-read" onClick={() => void markRead(item)} disabled={saving}><Check/>Mark read</button>}</article>)}</div>}
        </section>
      </div>
    </section>
  </main>;
}
