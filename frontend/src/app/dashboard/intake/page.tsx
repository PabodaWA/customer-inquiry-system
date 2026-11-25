"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Activity, Bell, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Coffee, Eye, FilePlus2, Inbox, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Search, Settings, UserRound, X } from "lucide-react";
import ThemeToggle from "../../../components/ThemeToggle";
import InquiryEvidence from "../../../components/InquiryEvidence";
import { useInquiryRefresh } from "../../../lib/useInquiryRefresh";
import { useLogout } from "../../../lib/useLogout";
import LogoutFeedback from "../../../components/LogoutFeedback";
import "./intake.css";

type Status = "NEW" | "IN_PROGRESS" | "RESOLVED";
type Inquiry = { id: number; customer_name: string; subject: string; category: string; status: Status; created_at: string; contact: string; customer_email?: string | null; description?: string; assigned_to?: number | null; assigned_staff_name?: string | null; assignment_status?: "PENDING" | "ASSIGNED"; evidence_files?: { id: number; file_name: string; mime_type: string; data_url: string }[] };
type ActivityEvent = { id: number; inquiry_id: number; action: string; old_value?: string | null; new_value?: string | null; customer_name: string; created_at: string; changed_by_name?: string | null };
type Notification = { id: number; inquiry_id: number | null; kind: string; message: string; created_at: string; read_at: string | null };
type User = { id: number; fullName: string; email: string; role: string };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const statusLabel = (status: Status) => status === "IN_PROGRESS" ? "In progress" : status[0] + status.slice(1).toLowerCase();
const dateLabel = (value: string) => { const d = new Date(value); return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(d); };
const initials = (value: string) => value.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();

export default function IntakeDashboard() {
  const router = useRouter();
  const { logout, error: logoutError } = useLogout();
  const [user, setUser] = useState<User | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityError, setActivityError] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [date, setDate] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInput = useRef<HTMLInputElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const clockTimer = window.setTimeout(() => setNow(new Date()), 0);
    async function load() {
      try {
        const meResponse = await fetch(`${apiUrl}/api/auth/me`, { credentials: "include" });
        const me = await meResponse.json() as { user?: User };
        if (!meResponse.ok || !me.user) { router.replace("/"); return; }
        if (me.user.role !== "INTAKE") { router.replace(me.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/handler"); return; }
        const [resultResponse, activityResponse, notificationResponse] = await Promise.all([
          fetch(`${apiUrl}/api/inquiries`, { credentials: "include" }),
          fetch(`${apiUrl}/api/inquiries/activity?limit=5`, { credentials: "include" }).catch(() => null),
          fetch(`${apiUrl}/api/notifications`, { credentials: "include" }).catch(() => null),
        ]);
        const result = await resultResponse.json() as { success?: boolean; data?: Inquiry[]; message?: string };
        if (!resultResponse.ok || !result.success) throw new Error(result.message ?? "Could not load inquiries.");
        if (active) { setUser(me.user); setInquiries(result.data ?? []); }
        if (activityResponse?.ok) {
          const activity = await activityResponse.json() as { success?: boolean; data?: ActivityEvent[] };
          if (active && activity.success) setActivityEvents(activity.data ?? []);
          else if (active) setActivityError(true);
        } else if (active) setActivityError(true);
        if (notificationResponse?.ok) {
          const notificationResult = await notificationResponse.json() as { success?: boolean; data?: Notification[]; unread_count?: number };
          if (active && notificationResult.success) { setNotifications(notificationResult.data ?? []); setUnreadCount(notificationResult.unread_count ?? 0); }
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Could not load inquiries."); }
      finally { if (active) setLoading(false); }
    }
    void load();
    return () => { active = false; window.clearTimeout(clockTimer); };
  }, [router]);

  const refreshInquiries = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/inquiries`, { credentials: "include" });
      const result = await response.json() as { success?: boolean; data?: Inquiry[]; message?: string };
      if (!response.ok || !result.success) throw new Error(result.message ?? "Could not refresh inquiries.");
      const currentInquiries = result.data ?? [];
      setInquiries(currentInquiries);
      const notificationResponse = await fetch(`${apiUrl}/api/notifications`, { credentials: "include" });
      if (notificationResponse.ok) {
        const notificationResult = await notificationResponse.json() as { success?: boolean; data?: Notification[]; unread_count?: number };
        if (notificationResult.success) { setNotifications(notificationResult.data ?? []); setUnreadCount(notificationResult.unread_count ?? 0); }
      }
      setSelected((current) => {
        const latest = currentInquiries.find((item) => item.id === current?.id);
        return latest && current ? { ...current, ...latest } : current;
      });
    } catch (cause) {
      console.error("Could not refresh inquiry data.", cause);
    }
  }, []);
  useInquiryRefresh(refreshInquiries);

  async function openNotification(item: Notification) {
    if (!item.read_at) {
      try {
        const response = await fetch(`${apiUrl}/api/notifications/${item.id}/read`, { method: "PATCH", credentials: "include" });
        if (response.ok) { const timestamp = new Date().toISOString(); setNotifications((current) => current.map((notice) => notice.id === item.id ? { ...notice, read_at: timestamp } : notice)); setUnreadCount((count) => Math.max(0, count - 1)); }
      } catch { /* Keep the notification available if marking it read fails. */ }
    }
    const inquiry = inquiries.find((candidate) => candidate.id === item.inquiry_id);
    if (inquiry) void openInquiry(inquiry);
    setNotificationsOpen(false);
  }
  async function openInquiry(inquiry: Inquiry) {
    setSelected(inquiry);
    try {
      const response = await fetch(`${apiUrl}/api/inquiries/${inquiry.id}`, { credentials: "include" });
      const result = await response.json() as { success?: boolean; data?: Inquiry };
      if (response.ok && result.success && result.data) setSelected(result.data);
    } catch { /* Keep the inquiry summary visible if details cannot load. */ }
  }
  const counts = { total: inquiries.length, fresh: inquiries.filter((i) => i.status === "NEW").length, progress: inquiries.filter((i) => i.status === "IN_PROGRESS").length, resolved: inquiries.filter((i) => i.status === "RESOLVED").length };
  const filtered = useMemo(() => inquiries.filter((i) => {
    const q = search.trim().toLowerCase();
    const matches = !q || [i.id, i.customer_name, i.subject, i.contact, i.assigned_staff_name].some((x) => String(x ?? "").toLowerCase().includes(q));
    return matches && (status === "ALL" || i.status === status) && (!date || new Date(i.created_at).toISOString().slice(0, 10) === date);
  }), [inquiries, search, status, date]);
  const pageSize = 7, pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activities = activityEvents;
  const greeting = now ? (now.getHours() < 12 ? "morning" : now.getHours() < 18 ? "afternoon" : "evening") : "day";
  const greetingName = user?.fullName?.trim().toLowerCase() === "intake staff" ? "" : user?.fullName?.trim().split(/\s+/)[0] ?? "";

  return <div className={`intake-app${sidebarCollapsed ? " is-collapsed" : ""}`}>
    <LogoutFeedback error={logoutError} onRetry={() => void logout()}/>
    {mobileNav && <button className="intake-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside id="intake-sidebar" className={`intake-sidebar ${mobileNav ? "is-open" : ""}`}>

      <Link href="/dashboard/intake" className="intake-brand"><span className="intake-brand-icon"><Coffee size={21}/></span><span><small>INQUIRY PORTAL</small></span><button className="intake-close" aria-label="Close menu" onClick={(e) => { e.preventDefault(); setMobileNav(false); }}><X size={18}/></button></Link>
      <div className="intake-nav-label">WORKSPACE</div>
      <nav className="intake-nav" aria-label="Main navigation">
        <Link className="current" href="/dashboard/intake"><LayoutDashboard size={18}/>Dashboard</Link>
        <Link href="/dashboard/intake/inquiries"><ClipboardList size={18}/>My created inquiries</Link>
        <Link href="/dashboard/intake/new"><FilePlus2 size={18}/>New inquiry</Link>
        <Link href="/dashboard/intake/notifications"><Bell size={18}/>Notifications{unreadCount > 0 && <span className="intake-nav-unread">{unreadCount > 9 ? "9+" : unreadCount}</span>}</Link>
      </nav>
      <div className="intake-nav-label settings-label">PREFERENCES</div><nav className="intake-nav"><Link href="/dashboard/intake/settings"><Settings size={18}/>Settings</Link></nav>
      <div className="intake-sidebar-profile"><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span className="intake-profile-name"><strong>{user?.fullName ?? "Intake Staff"}</strong><small>Intake Staff</small></span><button className="intake-logout" title="Log out" aria-label="Log out" onClick={() => void logout()}><LogOut size={17}/></button></div>
    </aside>
    <main className="intake-main">
      <header className="intake-topbar"><button className="intake-sidebar-toggle" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} aria-controls="intake-sidebar">{sidebarCollapsed ? <PanelLeftOpen size={19}/> : <PanelLeftClose size={19}/>}</button><button className="intake-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="intake-breadcrumb"><span>Workspace</span><ChevronRight size={14}/><strong>Dashboard</strong></div><div className="intake-top-tools"><button className="intake-icon-button intake-mobile-search" aria-label="Open search" onClick={() => { setMobileSearchOpen(true); window.setTimeout(() => mobileSearchInput.current?.focus(), 0); }}><Search size={17}/></button><label className={`intake-global-search ${mobileSearchOpen ? "search-open" : ""}`}><Search size={17}/><input ref={mobileSearchInput} aria-label="Search inquiries" placeholder="Search inquiries..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/><kbd>/</kbd></label><div className="intake-notification-wrap"><button className="intake-icon-button intake-bell" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`} aria-expanded={notificationsOpen} onClick={() => { setNotificationsOpen((open) => !open); setProfileOpen(false); }}><Bell size={18}/>{unreadCount > 0 && <i>{unreadCount > 9 ? "9+" : unreadCount}</i>}</button>{notificationsOpen && <section className="intake-notification-panel" aria-label="Notifications"><header><strong>Notifications</strong><span>{unreadCount} unread</span></header>{notifications.length ? notifications.map((item) => <button key={item.id} className={`intake-notification-item${item.read_at ? " read" : ""}`} onClick={() => void openNotification(item)}><span className="intake-notification-dot"/><span><small>{item.message}</small><em>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(item.created_at))}</em></span></button>) : <p className="intake-no-notifications">No notifications yet.</p>}</section>}</div><ThemeToggle className="intake-icon-button"/><div className="intake-profile-menu-wrap"><button className="intake-top-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span><strong>{user?.fullName ?? "Staff"}</strong><small>Intake Staff</small></span><ChevronDown size={15}/></button>{profileOpen && <div className="intake-profile-dropdown"><strong>{user?.fullName ?? "Staff"}</strong><small>{user?.email ?? ""}</small><button onClick={() => void logout()}><LogOut size={14}/> Log out</button></div>}</div></div></header>
      <div className="intake-content">
        <div className="intake-heading"><div><p className="intake-kicker">INTAKE OVERVIEW</p><h1>Good {greeting}{greetingName ? `, ${greetingName}` : ""} <span>{"\u2726"}</span></h1><p>Here’s what’s happening with your customer inquiries today.</p></div><Link className="intake-create" href="/dashboard/intake/new"><FilePlus2 size={17}/>Create new inquiry</Link></div>
        <section className="intake-stats" aria-label="Inquiry overview">
          <article><div className="intake-stat-head"><span className="intake-stat-icon teal"><ClipboardList size={19}/></span><span className="intake-stat-note teal-note">All records</span></div><small>Total inquiries</small><strong>{loading ? "—" : counts.total.toLocaleString()}</strong><p>Across your intake queue</p></article>
          <article><div className="intake-stat-head"><span className="intake-stat-icon blue"><Inbox size={19}/></span><span className="intake-stat-note blue-note">Needs review</span></div><small>New inquiries</small><strong>{loading ? "—" : counts.fresh.toLocaleString()}</strong><p>Awaiting first response</p></article>
          <article><div className="intake-stat-head"><span className="intake-stat-icon amber"><Activity size={19}/></span><span className="intake-stat-note amber-note">Being handled</span></div><small>In progress</small><strong>{loading ? "—" : counts.progress.toLocaleString()}</strong><p>Currently with the team</p></article>
          <article><div className="intake-stat-head"><span className="intake-stat-icon green"><CheckCircle2 size={19}/></span><span className="intake-stat-note green-note">Completed</span></div><small>Resolved inquiries</small><strong>{loading ? "—" : counts.resolved.toLocaleString()}</strong><p>Successfully closed</p></article>
        </section>
        <div className="intake-lower-grid">
          <section className="intake-table-panel" id="recent-inquiries"><div className="intake-panel-head"><div><p className="intake-kicker">INBOX</p><h2>My recent inquiries <span>{filtered.length}</span></h2><p>Review and monitor inquiries you registered.</p></div><Link href="/dashboard/intake/inquiries">View my inquiries <ChevronRight size={15}/></Link></div>
            <div className="intake-filters"><label className="intake-table-search"><Search size={16}/><input aria-label="Filter inquiries" placeholder="Search by name, subject or ID" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/></label><label><span className="sr-only">Filter by status</span><select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="NEW">New</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></label><label className="intake-date-filter"><span className="sr-only">Filter by date</span><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }}/></label></div>
            {error ? <div className="intake-empty"><strong>We couldn’t load inquiries</strong><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div> : loading ? <div className="intake-empty">Loading inquiries…</div> : visible.length === 0 ? <div className="intake-empty"><strong>{inquiries.length ? "No matching inquiries" : "No inquiries yet"}</strong><p>{inquiries.length ? "Adjust your filters to see more results." : "New customer requests will appear here."}</p></div> : <div className="intake-table-scroll"><table><thead><tr><th>INQUIRY ID</th><th>CUSTOMER</th><th>SUBJECT</th><th>CONTACT</th><th>ASSIGNED STAFF</th><th>CREATED</th><th>STATUS</th><th/></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><span className="intake-ref">CN-{String(item.id).padStart(4, "0")}</span></td><td><span className="intake-customer"><i>{initials(item.customer_name)}</i><strong>{item.customer_name}</strong></span></td><td className="intake-subject">{item.subject}</td><td className="intake-contact">{item.contact || "—"}</td><td>{(item.assigned_staff_name || item.assigned_to || item.assignment_status === "ASSIGNED") ? <span className="intake-assignee"><i>{initials(item.assigned_staff_name ?? "Handler")}</i>{item.assigned_staff_name ?? (item.assigned_to ? `Staff #${item.assigned_to}` : "Assigned")}</span> : <span className="intake-unassigned">Unassigned</span>}</td><td className="intake-created">{dateLabel(item.created_at)}</td><td><span className={`intake-status status-${item.status.toLowerCase()}`}><i/>{statusLabel(item.status)}</span></td><td><button className="intake-view" aria-label={`View CN-${item.id}`} onClick={() => void openInquiry(item)}><Eye size={16}/></button></td></tr>)}</tbody></table></div>}
            <div className="intake-pagination"><span>Showing <strong>{filtered.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filtered.length)}</strong> of <strong>{filtered.length}</strong> inquiries</span><div><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft size={16}/></button><span>Page <strong>{page}</strong> of {pageCount}</span><button aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}><ChevronRight size={16}/></button></div></div>
          </section>
          <aside className="intake-activity-panel"><div className="intake-activity-head"><div><p className="intake-kicker">LATEST UPDATES</p><h2>Recent activity</h2></div></div><div className="intake-timeline">{activities.length ? activities.map((event) => <div className="intake-activity" key={event.id}><span className={`intake-timeline-icon ${event.action.toLowerCase()}`}>{event.action === "CREATED" ? <Inbox size={15}/> : event.action === "ASSIGNED" ? <UserRound size={15}/> : <Activity size={15}/>}</span><div><strong>{event.action === "CREATED" ? "New inquiry received" : event.action === "ASSIGNED" ? "Inquiry assigned to handler" : event.new_value === "RESOLVED" ? "Inquiry resolved" : "Inquiry status updated"}</strong><p><b>{event.customer_name}</b> · CN-{String(event.inquiry_id).padStart(4, "0")}</p><small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.created_at))}{event.changed_by_name ? ` · ${event.changed_by_name}` : ""}</small></div></div>) : <p className="intake-no-activity">{activityError ? "Activity history is unavailable." : "No inquiry activity recorded yet."}</p>}</div><Link className="activity-link" href="/dashboard/intake/inquiries">Open inquiry queue <ChevronRight size={14}/></Link></aside>
        </div>
        <footer className="intake-footer"><span>© {now?.getFullYear() ?? ""} Coffee Ninja</span><span>Customer care, brewed better.</span></footer>
      </div>
    </main>
    {selected && <div className="intake-modal-backdrop" role="presentation" onClick={() => setSelected(null)}><section className="intake-modal" role="dialog" aria-modal="true" aria-labelledby="intake-modal-title" onClick={(e) => e.stopPropagation()}><div className="intake-modal-title"><div><p className="intake-kicker">INQUIRY DETAILS</p><h2 id="intake-modal-title">CN-{String(selected.id).padStart(4, "0")}</h2></div><button onClick={() => setSelected(null)} aria-label="Close details"><X size={19}/></button></div><div className="intake-modal-customer"><i>{initials(selected.customer_name)}</i><div><strong>{selected.customer_name}</strong><small>{selected.contact || "Contact unavailable"}{selected.customer_email ? ` | ${selected.customer_email}` : ""}</small></div></div><div className="intake-modal-description"><strong>Description</strong><p>{selected.description || "No description provided."}</p></div><InquiryEvidence files={selected.evidence_files}/><dl><div><dt>Subject</dt><dd>{selected.subject}</dd></div><div><dt>Contact</dt><dd>{selected.contact || "—"}</dd></div><div><dt>Category</dt><dd>{selected.category}</dd></div><div><dt>Assigned staff</dt><dd>{selected.assigned_staff_name ?? (selected.assigned_to ? `Staff #${selected.assigned_to}` : selected.assignment_status === "ASSIGNED" ? "Assigned" : "Unassigned")}</dd></div><div><dt>Status</dt><dd><span className={`intake-status status-${selected.status.toLowerCase()}`}>{statusLabel(selected.status)}</span></dd></div><div><dt>Created</dt><dd>{dateLabel(selected.created_at)}</dd></div></dl><button className="intake-modal-done" onClick={() => setSelected(null)}>Done</button></section></div>}
  </div>;
}
