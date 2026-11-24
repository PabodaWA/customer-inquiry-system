"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Activity, Bell, Check, CheckCircle2, ChevronDown, CircleAlert, ClipboardList, Clock3, Coffee, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Search, Settings, Sun, UserRound, X } from "lucide-react";
import { apiRequest, displayDate, inquiryReference, readableLabel, type ApiResult } from "../../../lib/admin";
import { useInquiryRefresh } from "../../../lib/useInquiryRefresh";
import InquiryEvidence from "../../../components/InquiryEvidence";
import { useLogout } from "../../../lib/useLogout";
import LogoutFeedback from "../../../components/LogoutFeedback";

type Inquiry = {
  id: number; customer_name: string; contact: string; subject: string; description: string;
  category: string; status: "NEW" | "IN_PROGRESS" | "RESOLVED"; handler_response_status: string;
  created_at: string; assigned_at?: string; customer_email?: string | null;
  evidence_files?: { id: number; file_name: string; mime_type: string; data_url: string }[];
};
type Stats = { total: number; pending: number; in_progress: number; resolved: number; declined: number };
type DeclinedInquiry = Inquiry & { decline_reason: string; declined_at: string };
type User = { id: number; fullName: string; email: string; role: string; specialization?: string };
type Event = { id: number; action: string; new_value: string | null; created_at: string; changed_by_name: string };
type Notification = { id: number; inquiry_id: number | null; kind: string; message: string; created_at: string; read_at: string | null };

export default function HandlerDashboard() {
  const router = useRouter();
  const { logout, error: logoutError } = useLogout();
  const { resolvedTheme, setTheme } = useTheme();
  const themeMounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<Inquiry[]>([]);
  const [declinedItems, setDeclinedItems] = useState<DeclinedInquiry[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, pending: 0, in_progress: 0, resolved: 0, declined: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("ALL");
  const [view, setView] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
  const [page, setPage] = useState(1);
  const [declineTarget, setDeclineTarget] = useState<Inquiry | null>(null);
  const [resolveTarget, setResolveTarget] = useState<Inquiry | null>(null);
  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState<Inquiry | null>(null);
  const [timeline, setTimeline] = useState<Event[]>([]);
  const [busy, setBusy] = useState(false);
  const [declinedLoading, setDeclinedLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const me = await apiRequest<User>("/api/auth/me") as ApiResult<User> & { user: User };
      if (me.user.role !== "HANDLER") { router.replace(me.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/intake"); return; }
      setUser(me.user);
      const result = await apiRequest<Inquiry[]>("/api/inquiries/handler-dashboard") as ApiResult<Inquiry[]> & { stats?: Stats };
      setItems(result.data ?? []);
      setStats(result.stats ?? { total: 0, pending: 0, in_progress: 0, resolved: 0, declined: 0 });
      const notificationResult = await apiRequest<Notification[]>("/api/notifications") as ApiResult<Notification[]> & { unread_count?: number };
      setNotifications(notificationResult.data ?? []);
      setUnreadCount(notificationResult.unread_count ?? 0);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your inquiries."); }
    finally { setLoading(false); }
  }, [router]);

  const refreshInquiries = useCallback(async () => {
    if (!user) return;
    try {
      const result = await apiRequest<Inquiry[]>("/api/inquiries/handler-dashboard") as ApiResult<Inquiry[]> & { stats?: Stats };
      const currentItems = result.data ?? [];
      setItems(currentItems);
      setStats(result.stats ?? { total: 0, pending: 0, in_progress: 0, resolved: 0, declined: 0 });
      setDetail((current) => {
        const latest = currentItems.find((item) => item.id === current?.id);
        return latest && current ? { ...current, ...latest } : current;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not refresh your inquiries.");
    }
  }, [user]);
  useInquiryRefresh(refreshInquiries);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const categories = useMemo(() => [...new Set(items.map((item) => item.category))].sort(), [items]);
  const visible = useMemo(() => items.filter((item) => {
    const term = search.trim().toLowerCase();
    const matches = !term || [inquiryReference(item.id), item.id, item.customer_name, item.subject, item.category].some((value) => String(value).toLowerCase().includes(term));
    const statusMatches = view === "ALL" || (view === "PENDING" && item.handler_response_status === "WAITING") || (view === "IN_PROGRESS" && item.status === "IN_PROGRESS") || (view === "RESOLVED" && item.status === "RESOLVED");
    return matches && statusMatches && (category === "ALL" || category === item.category);
  }).sort((a, b) => sort === "NEWEST"
    ? new Date(b.assigned_at ?? b.created_at).getTime() - new Date(a.assigned_at ?? a.created_at).getTime()
    : new Date(a.assigned_at ?? a.created_at).getTime() - new Date(b.assigned_at ?? b.created_at).getTime()), [items, search, view, category, sort]);
  const pageSize = 8;
  const declinedVisible = useMemo(() => declinedItems.filter((item) => {
    const term = search.trim().toLowerCase();
    return (!term || [inquiryReference(item.id), item.id, item.customer_name, item.subject, item.category].some((value) => String(value).toLowerCase().includes(term))) && (category === "ALL" || category === item.category);
  }).sort((a, b) => sort === "NEWEST" ? new Date(b.declined_at).getTime() - new Date(a.declined_at).getTime() : new Date(a.declined_at).getTime() - new Date(b.declined_at).getTime()), [declinedItems, search, category, sort]);
  const currentCount = view === "DECLINED" ? declinedVisible.length : visible.length;
  const pageCount = Math.max(1, Math.ceil(currentCount / pageSize));
  const rows = visible.slice((page - 1) * pageSize, page * pageSize);
  const declinedRows = declinedVisible.slice((page - 1) * pageSize, page * pageSize);

  async function act(id: number, action: "accept" | "decline" | "resolve", declineReason?: string) {
    setBusy(true); setError("");
    try {
      await apiRequest(`/api/inquiries/${id}/${action}`, { method: "POST", ...(action === "decline" ? { body: JSON.stringify({ reason: declineReason }) } : {}) });
      setNotice(action === "accept" ? "Inquiry accepted and moved to In Progress." : action === "decline" ? "Inquiry returned to the admin reassignment queue." : "Inquiry marked as resolved.");
      setDeclineTarget(null); setDetail(null); setReason(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The action could not be completed."); }
    finally { setBusy(false); }
  }
  async function openDetail(item: Inquiry) {
    setDetail(item); setTimeline([]);
    try {
      const [details, history] = await Promise.all([apiRequest<Inquiry>(`/api/inquiries/${item.id}`), apiRequest<Event[]>(`/api/inquiries/${item.id}/history`)]);
      setDetail(details.data ?? item); setTimeline(history.data ?? []);
    }
    catch { /* Inquiry details remain available if history cannot load. */ }
  }
  async function openDeclinedDetail(item: DeclinedInquiry) {
    setDetail(item); setTimeline([]);
    try {
      const history = await apiRequest<Event[]>(`/api/inquiries/${item.id}/history`);
      setTimeline(history.data ?? []);
    } catch { /* Declined inquiry details remain available if history cannot load. */ }
  }
  async function markRead(item: Notification) {
    if (!item.read_at) {
      try { await apiRequest(`/api/notifications/${item.id}/read`, { method: "PATCH" }); setNotifications((current) => current.map((notice) => notice.id === item.id ? { ...notice, read_at: new Date().toISOString() } : notice)); setUnreadCount((count) => Math.max(0, count - 1)); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the notification."); }
    }
    if (item.inquiry_id) {
      const inquiry = items.find((candidate) => candidate.id === item.inquiry_id);
      if (inquiry) void openDetail(inquiry);
    }
    setNotificationsOpen(false);
  }
  async function openDeclined() {
    setView("DECLINED"); setPage(1); setNotificationsOpen(false); setError(""); setDeclinedLoading(true);
    try { const result = await apiRequest<DeclinedInquiry[]>("/api/inquiries/handler-dashboard/declined"); setDeclinedItems(result.data ?? []); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load declined inquiries."); }
    finally { setDeclinedLoading(false); }
  }

  const dark = themeMounted && resolvedTheme === "dark";
  return <main className={`handler-shell${sidebarCollapsed ? " is-collapsed" : ""}`}>
    <LogoutFeedback error={logoutError} onRetry={() => void logout()}/>
    <aside id="handler-sidebar" className="handler-sidebar">
      <div className="handler-brand"><span className="handler-brand-mark"><Coffee size={21}/></span><div><small>INQUIRY PORTAL</small></div></div>
      <p className="handler-nav-label">WORKSPACE</p>
      <nav className="handler-nav" aria-label="Handler navigation">
        <button className={view === "ALL" ? "active" : ""} onClick={() => { setView("ALL"); setPage(1); }}><ClipboardList/>Dashboard</button>
        <button className={view === "PENDING" ? "active" : ""} onClick={() => { setView("PENDING"); setPage(1); }}><Clock3/>Pending acceptance</button>
        <button className={view === "IN_PROGRESS" ? "active" : ""} onClick={() => { setView("IN_PROGRESS"); setPage(1); }}><Activity/>In Progress</button>
        <button className={view === "RESOLVED" ? "active" : ""} onClick={() => { setView("RESOLVED"); setPage(1); }}><CheckCircle2/>Resolved</button>
        <button className={view === "DECLINED" ? "active" : ""} onClick={() => void openDeclined()}><CircleAlert/>Declined / Returned</button>
        <button onClick={() => router.push("/dashboard/handler/notifications")}><Bell/>Notifications{unreadCount > 0 && <span className="handler-nav-count">{unreadCount}</span>}</button>
        <span className="handler-preferences-label">PREFERENCES</span>
        <button onClick={() => router.push("/dashboard/handler/settings")}><Settings/>Settings</button>
      </nav>
      <div className="handler-sidebar-bottom"><div className="handler-profile"><span><UserRound/></span><div><strong>{user?.fullName ?? "Handler"}</strong><small>{user?.specialization ? `${readableLabel(user.specialization)} specialist` : "Handler"}</small></div></div><button className="handler-logout" onClick={() => void logout()}><LogOut/>Log out</button></div>
    </aside>
    <section className="handler-main">
      <header className="handler-topbar"><button className="handler-sidebar-toggle" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} aria-controls="handler-sidebar">{sidebarCollapsed ? <PanelLeftOpen/> : <PanelLeftClose/>}</button><div><p>HANDLER WORKSPACE</p><h1>My dashboard</h1></div><div className="handler-top-actions"><label className="handler-global-search"><Search/><input aria-label="Search inquiries" placeholder="Search inquiries..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}/><kbd>/</kbd></label><div className="handler-notification-wrap"><button className="handler-theme handler-bell" onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); }} aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={notificationsOpen}><Bell/>{unreadCount > 0 && <i>{unreadCount > 9 ? "9+" : unreadCount}</i>}</button>{notificationsOpen && <section className="handler-notification-panel" aria-label="Notifications"><header><strong>Notifications</strong><span>{unreadCount} unread</span></header>{notifications.length ? notifications.map((item) => <button key={item.id} className={`handler-notification-item${item.read_at ? " read" : ""}`} onClick={() => void markRead(item)}><span className="handler-notification-dot"/><span><strong>{item.kind === "NEW_ASSIGNMENT" ? "New assignment" : readableLabel(item.kind)}</strong><small>{item.message}</small><em>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.created_at))}</em></span></button>) : <p className="handler-no-notifications">No notifications yet.</p>}</section>}</div><button className="handler-theme" onClick={() => setTheme(dark ? "light" : "dark")} aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}>{dark ? <Sun/> : <Moon/>}</button><div className="handler-profile-top-wrap"><button className="handler-profile-top" onClick={() => { setProfileOpen((open) => !open); setNotificationsOpen(false); }} aria-expanded={profileOpen}><span className="handler-avatar">{user?.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase() ?? "H"}</span><span className="handler-profile-top-copy"><strong>{user?.fullName ?? "Handler"}</strong><small>{user?.specialization ? `${readableLabel(user.specialization)} Handler` : "Handler"}</small></span><ChevronDown/></button>{profileOpen && <div className="handler-profile-dropdown"><strong>{user?.fullName}</strong><small>{user?.email}</small><button onClick={() => router.push("/dashboard/handler/settings")}><Settings/>Settings</button><button onClick={() => void logout()}><LogOut/>Log out</button></div>}</div></div></header>
      {error && <div className="handler-feedback handler-error" role="alert"><CircleAlert/>{error}<button onClick={() => view === "DECLINED" ? void openDeclined() : void load()}>Retry</button><button onClick={() => setError("")} aria-label="Dismiss"><X/></button></div>}
      {notice && <div className="handler-feedback handler-success" role="status"><Check/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X/></button></div>}
      <section className="handler-stats" aria-label="Inquiry summary">
        {([["teal", ClipboardList, "Total assigned", stats.total, "Current workload", "ALL"], ["blue", Clock3, "Pending acceptance", stats.pending, "Needs your response", "PENDING"], ["orange", Activity, "In progress", stats.in_progress, "Currently being handled", "IN_PROGRESS"], ["green", CheckCircle2, "Resolved", stats.resolved, "Completed inquiries", "RESOLVED"], ["red", CircleAlert, "Declined", stats.declined, "Returned to admin", "DECLINED"]] as const).map(([tone, Icon, label, count, hint, target]) => <article key={label} className={view === target ? "selected" : ""} role="button" tabIndex={0} aria-pressed={view === target} onClick={() => target === "DECLINED" ? void openDeclined() : (setView(target), setPage(1))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (target === "DECLINED") void openDeclined(); else { setView(target); setPage(1); } } }}><span className={`hs-icon ${tone}`}><Icon/></span><div><small>{label}</small><strong>{loading ? "-" : count}</strong><em>{hint}</em></div></article>)}
      </section>
      <section className="handler-list"><div className="handler-list-head"><div><span className="handler-kicker">YOUR QUEUE</span><h2>{view === "ALL" ? "My assigned inquiries" : view === "PENDING" ? "Pending acceptance" : view === "DECLINED" ? "Declined / Returned Inquiries" : readableLabel(view)}</h2><p>{view === "DECLINED" ? "Read-only history of assignments you returned to the admin queue." : "Only inquiries currently assigned to your account are shown."}</p></div></div>
        <div className="handler-filters"><label className="handler-search"><Search/><input placeholder="Search by reference or customer" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}/></label><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} aria-label="Filter by category"><option value="ALL">All categories</option>{categories.map((item) => <option key={item} value={item}>{readableLabel(item)}</option>)}</select><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} aria-label="Sort inquiries"><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option></select></div>
        {view === "DECLINED" ? declinedLoading ? <div className="handler-empty">Loading declined inquiries...</div> : declinedRows.length === 0 ? <div className="handler-empty"><ClipboardList/><strong>No declined inquiries</strong><span>Your returned assignments will appear here.</span></div> : <div className="handler-table-wrap"><table className="handler-table"><thead><tr><th>REFERENCE</th><th>CUSTOMER</th><th>SUBJECT</th><th>CATEGORY</th><th>DECLINED DATE</th><th>DECLINE REASON</th><th>ACTION</th></tr></thead><tbody>{declinedRows.map((item) => <tr key={item.id}><td><span className="handler-ref">{inquiryReference(item.id)}</span></td><td><strong>{item.customer_name}</strong></td><td>{item.subject}</td><td><span className="handler-category">{readableLabel(item.category)}</span></td><td>{displayDate(item.declined_at)}</td><td className="declined-reason-readonly">{item.decline_reason}</td><td><button className="handler-view" onClick={() => void openDeclinedDetail(item)}>View details</button></td></tr>)}</tbody></table></div> : loading ? <div className="handler-empty">Loading your assigned inquiries...</div> : rows.length === 0 ? <div className="handler-empty"><ClipboardList/><strong>Nothing to show</strong><span>{items.length ? "Try changing your search or filters." : "New assignments will appear here."}</span></div> : <div className="handler-table-wrap"><table className="handler-table"><thead><tr><th>REFERENCE</th><th>CUSTOMER</th><th>SUBJECT</th><th>CATEGORY</th><th>ASSIGNED DATE</th><th>PRIORITY</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><button className="handler-ref" onClick={() => void openDetail(item)}>{inquiryReference(item.id)}</button></td><td><strong>{item.customer_name}</strong></td><td>{item.subject}</td><td><span className="handler-category">{readableLabel(item.category)}</span></td><td>{displayDate(item.assigned_at ?? item.created_at)}</td><td><span className="priority-normal">-</span></td><td><span className={`handler-status ${item.status.toLowerCase()}`}>{item.handler_response_status === "WAITING" ? "Pending acceptance" : readableLabel(item.status)}</span></td><td><div className="handler-row-actions"><button className="handler-view" onClick={() => void openDetail(item)}>View details</button></div></td></tr>)}</tbody></table></div>}
        <div className="handler-pagination"><span>Showing <b>{currentCount ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, currentCount)}</b> of <b>{currentCount}</b></span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>{page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button></div></div>
      </section><footer className="handler-footer">Customer care, brewed better.<span>Secure handler workspace</span></footer>
    </section>
    {declineTarget && <div className="handler-overlay" onClick={() => !busy && setDeclineTarget(null)}><section className="handler-modal" role="dialog" aria-modal="true" aria-labelledby="decline-title" onClick={(event) => event.stopPropagation()}><header><div><span className="handler-kicker">RETURN ASSIGNMENT</span><h2 id="decline-title">Decline inquiry</h2></div><button onClick={() => setDeclineTarget(null)} aria-label="Close"><X/></button></header><dl><div><dt>Reference</dt><dd>{inquiryReference(declineTarget.id)}</dd></div><div><dt>Customer</dt><dd>{declineTarget.customer_name}</dd></div><div><dt>Category</dt><dd>{readableLabel(declineTarget.category)}</dd></div></dl><label className="handler-reason">Reason for declining<textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={2000} placeholder="Explain why this inquiry should be reassigned..."/><small>{reason.trim().length}/2000 characters - minimum 10</small></label><div className="handler-modal-actions"><button className="handler-cancel" disabled={busy} onClick={() => setDeclineTarget(null)}>Cancel</button><button className="handler-confirm-decline" disabled={busy || reason.trim().length < 10} onClick={() => void act(declineTarget.id, "decline", reason)}>{busy ? "Returning..." : "Confirm decline"}</button></div></section></div>}
    {detail && <div className="handler-overlay" onClick={() => setDetail(null)}><section className="handler-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}><header><div><span className="handler-kicker">INQUIRY DETAILS</span><h2 id="detail-title">{inquiryReference(detail.id)}</h2></div><button onClick={() => setDetail(null)} aria-label="Close"><X/></button></header><dl><div><dt>Customer</dt><dd>{detail.customer_name}</dd></div><div><dt>Contact</dt><dd>{detail.contact}{detail.customer_email ? ` | ${detail.customer_email}` : ""}</dd></div><div><dt>Subject</dt><dd>{detail.subject}</dd></div><div><dt>Category</dt><dd>{readableLabel(detail.category)}</dd></div><div><dt>Assigned date</dt><dd>{displayDate(detail.assigned_at ?? detail.created_at)}</dd></div><div><dt>Current status</dt><dd>{detail.handler_response_status === "WAITING" ? "Pending acceptance" : detail.handler_response_status === "DECLINED" ? "Declined / Returned" : readableLabel(detail.status)}</dd></div><div className="handler-description"><dt>Description</dt><dd>{detail.description}</dd></div></dl><InquiryEvidence files={detail.evidence_files}/><section className="handler-timeline"><h3>Activity timeline</h3>{timeline.length === 0 ? <p>Loading activity...</p> : timeline.map((event) => <article key={event.id}><span/><div><strong>{readableLabel(event.action)}</strong><small>{event.changed_by_name} - {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.created_at))}</small>{event.new_value && event.action !== "CREATED" && <p>{event.new_value}</p>}</div></article>)}</section><div className="handler-modal-actions"><button className="handler-cancel" onClick={() => setDetail(null)}>Close</button>{detail.handler_response_status === "WAITING" && <><button className="handler-decline" disabled={busy} onClick={() => { setDeclineTarget(detail); setReason(""); setDetail(null); }}>Decline</button><button className="handler-accept" disabled={busy} onClick={() => void act(detail.id, "accept")}>{busy ? "Accepting..." : "Accept"}</button></>}{detail.status === "IN_PROGRESS" && <button className="handler-resolve" disabled={busy} onClick={() => { setResolveTarget(detail); setDetail(null); }}>Mark resolved</button>}</div></section></div>}
    {resolveTarget && <div className="handler-overlay" onClick={() => !busy && (setResolveTarget(null), setDetail(resolveTarget))}><section className="handler-modal handler-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="resolve-title" onClick={(event) => event.stopPropagation()}><header><div><span className="handler-kicker">CONFIRM RESOLUTION</span><h2 id="resolve-title">Mark inquiry resolved?</h2></div><button disabled={busy} onClick={() => { setResolveTarget(null); setDetail(resolveTarget); }} aria-label="Close"><X/></button></header><p className="handler-confirm-copy">Are you sure you have finished handling <strong>{inquiryReference(resolveTarget.id)}</strong>?</p><div className="handler-confirm-warning"><CircleAlert/><span>Once confirmed, this inquiry will be marked as resolved. You will not be able to change its status again from the handler dashboard.</span></div><div className="handler-modal-actions"><button className="handler-cancel" disabled={busy} onClick={() => { setResolveTarget(null); setDetail(resolveTarget); }}>Go back</button><button className="handler-confirm-resolve" disabled={busy} onClick={() => { setResolveTarget(null); void act(resolveTarget.id, "resolve"); }}>{busy ? "Marking resolved..." : "Yes, mark resolved"}</button></div></section></div>}\n  </main>;
}
