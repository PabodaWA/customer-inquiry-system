"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, ChevronRight } from "lucide-react";
import { useAdminLayout } from "../../../../components/AdminLayout";
import { apiRequest, inquiryReference, readableLabel, type ApiResult } from "../../../../lib/admin";

type Notification = { id: number; inquiry_id: number | null; kind: string; message: string; created_at: string; read_at: string | null };
type NotificationResult = ApiResult<Notification[]> & { unread_count?: number };
type Filter = "ALL" | "UNREAD" | "READ";

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function AdminNotificationsPage() {
  const { user } = useAdminLayout();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    const result = await apiRequest<Notification[]>("/api/notifications") as NotificationResult;
    setNotifications(result.data ?? []);
    setUnreadCount(result.unread_count ?? 0);
  }, []);

  useEffect(() => {
    let active = true;
    const initialLoad = window.setTimeout(() => {
      void loadNotifications().catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load notifications.");
      }).finally(() => { if (active) setLoading(false); });
    }, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadNotifications().catch(() => undefined);
    }, 10_000);
    return () => { active = false; window.clearTimeout(initialLoad); window.clearInterval(interval); };
  }, [loadNotifications]);

  async function markRead(item: Notification) {
    if (item.read_at) return;
    setSaving(true); setError("");
    try {
      await apiRequest(`/api/notifications/${item.id}/read`, { method: "PATCH" });
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((notice) => notice.id === item.id ? { ...notice, read_at: readAt } : notice));
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not mark all notifications as read.");
      await loadNotifications().catch(() => undefined);
    } finally { setSaving(false); }
  }

  const filtered = useMemo(() => notifications.filter((item) => filter === "ALL" || (filter === "UNREAD" ? !item.read_at : Boolean(item.read_at))), [notifications, filter]);

  return <div className="admin-notifications-page">
    <div className="admin-notifications-heading"><div><span className="panel-kicker">INBOX</span><h2>Notifications</h2><p>Updates about assignments and inquiry activity across your team.</p></div><button className="admin-mark-all" onClick={() => void markAllRead()} disabled={saving || unreadCount === 0}><CheckCheck size={15}/>Mark all as read</button></div>
    {error && <div className="admin-notifications-error" role="alert">{error}</div>}
    <section className="admin-notifications-card">
      <header className="admin-notifications-toolbar"><div className="admin-notification-filters" aria-label="Filter notifications">{(["ALL", "UNREAD", "READ"] as const).map((value) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{readableLabel(value)}{value === "UNREAD" && unreadCount > 0 && <span>{unreadCount}</span>}</button>)}</div><span>{unreadCount} unread</span></header>
      {loading ? <div className="admin-notifications-empty">Loading notifications...</div> : filtered.length === 0 ? <div className="admin-notifications-empty"><span><Bell size={20}/></span><strong>{filter === "UNREAD" ? "You’re all caught up" : "No notifications yet"}</strong><p>{filter === "UNREAD" ? "New inquiry updates will appear here." : "Team and inquiry updates will appear here."}</p></div> : <div className="admin-notification-list">{filtered.map((item) => <article key={item.id} className={`admin-notification-item${item.read_at ? " is-read" : " is-unread"}`}><span className="admin-notification-dot" aria-hidden="true"/><div className="admin-notification-copy"><div className="admin-notification-meta"><span>{readableLabel(item.kind)}</span><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div><p>{item.message}</p>{item.inquiry_id && <Link href="/dashboard/admin/inquiries" className="admin-notification-inquiry">Inquiry {inquiryReference(item.inquiry_id)} <ChevronRight size={14}/></Link>}</div>{!item.read_at && <button className="admin-mark-read" onClick={() => void markRead(item)} disabled={saving}><Check size={14}/>Mark read</button>}</article>)}</div>}
    </section>
    <p className="admin-notification-account">Signed in as {user.fullName}</p>
  </div>;
}
