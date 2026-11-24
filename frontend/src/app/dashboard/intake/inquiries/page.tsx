"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, Bell, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Coffee, Eye, FilePlus2, FilterX, Inbox, LayoutDashboard, LogOut, Menu, Search, Settings, X } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import { apiRequest, displayDate, inquiryReference, readableLabel, type Inquiry, type InquiryStatus } from "../../../../lib/admin";
import "../intake.css";

type User = { id: number; fullName: string; email: string; role: string };
type Category = { name: string; is_active: boolean };
type InquiryEvent = { id: number; action: string; old_value?: string | null; new_value?: string | null; changed_by_name?: string; created_at: string };
type ListResponse = { success?: boolean; data?: Inquiry[]; count?: number; stats?: { total: number; new_count: number; in_progress: number; resolved: number }; pagination?: { page: number; pageSize: number; total: number; totalPages: number } };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const statusValues: InquiryStatus[] = ["NEW", "IN_PROGRESS", "RESOLVED"];
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
const displayTimestamp = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
};

export default function IntakeInquiriesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [stats, setStats] = useState({ total: 0, new_count: 0, in_progress: 0, resolved: 0 });
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [datePreset, setDatePreset] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [assignment, setAssignment] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [history, setHistory] = useState<InquiryEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
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
          const categoryResult = await apiRequest<Category[]>("/api/inquiries/categories");
          if (active) { setUser(result.user); setCategories(categoryResult.data ?? []); }
        } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Unable to load the inquiry workspace."); }
      })();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const loadInquiries = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (assignment !== "ALL") params.set("assignment", assignment);
    if (datePreset === "CUSTOM") {
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
    } else if (datePreset !== "ALL") {
      const daysAgo = datePreset === "TODAY" ? 0 : Number(datePreset) - 1;
      const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - daysAgo);
      const today = new Date();
      params.set("date_from", `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`);
      params.set("date_to", `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`);
    }
    try {
      const result = await apiRequest<Inquiry[]>(`/api/inquiries?${params.toString()}`) as ListResponse;
      setInquiries(result.data ?? []); setTotal(result.pagination?.total ?? result.count ?? 0);
      setTotalPages(Math.max(1, result.pagination?.totalPages ?? 1));
      setStats(result.stats ?? { total: 0, new_count: 0, in_progress: 0, resolved: 0 }); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load inquiries."); }
    finally { setLoading(false); }
  }, [assignment, category, dateFrom, datePreset, dateTo, debouncedSearch, page, pageSize, status]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => { setLoading(true); void loadInquiries(); }, 0);
    return () => window.clearTimeout(timer);
  }, [user, loadInquiries]);

  const range = useMemo(() => {
    if (datePreset !== "CUSTOM") return { from: "", to: "" };
    return { from: dateFrom, to: dateTo };
  }, [dateFrom, datePreset, dateTo]);

  function resetFilters() {
    setSearch(""); setStatus(""); setCategory(""); setDatePreset("ALL"); setDateFrom(""); setDateTo(""); setAssignment("ALL"); setPage(1);
  }

  async function logout() {
    await fetch(`${apiUrl}/api/auth/logout`, { method: "POST", credentials: "include" });
    router.replace("/");
  }

  async function viewDetails(item: Inquiry) {
    setSelected(item); setDetailLoading(true); setHistory([]);
    try {
      const [detail, events] = await Promise.all([
        apiRequest<Inquiry>(`/api/inquiries/${item.id}`),
        apiRequest<InquiryEvent[]>(`/api/inquiries/${item.id}/history`),
      ]);
      setSelected(detail.data ?? item); setHistory(events.data ?? []);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to load inquiry details."); setSelected(null); }
    finally { setDetailLoading(false); }
  }

  const filteredLabel = search || status || category || datePreset !== "ALL" || assignment !== "ALL";
  const startRow = total ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);

  return <div className="intake-app">
    {mobileNav && <button className="intake-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`intake-sidebar ${mobileNav ? "is-open" : ""}`}>
      <Link href="/dashboard/intake" className="intake-brand"><span className="intake-brand-icon"><Coffee size={21}/></span><span><strong>Coffee Ninja</strong><small>INQUIRY DESK</small></span><button className="intake-close" aria-label="Close menu" onClick={(event) => { event.preventDefault(); setMobileNav(false); }}><X size={18}/></button></Link>
      <div className="intake-nav-label">WORKSPACE</div>
      <nav className="intake-nav" aria-label="Main navigation">
        <Link href="/dashboard/intake"><LayoutDashboard size={18}/>Dashboard</Link>
        <Link className="current" aria-current="page" href="/dashboard/intake/inquiries"><ClipboardList size={18}/>My created inquiries</Link>
        <Link href="/dashboard/intake/new"><FilePlus2 size={18}/>New inquiry</Link>
        <Link href="/notifications"><Bell size={18}/>Notifications<span className="nav-unread" aria-label="Unread notifications"/></Link>
      </nav>
      <div className="intake-nav-label settings-label">PREFERENCES</div><nav className="intake-nav"><Link href="/dashboard/intake/settings"><Settings size={18}/>Settings</Link></nav>
      <div className="intake-sidebar-profile"><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span className="intake-profile-name"><strong>{user?.fullName ?? "Intake Staff"}</strong><small>Intake Staff</small></span><button className="intake-logout" aria-label="Log out" onClick={() => void logout()}><LogOut size={17}/></button></div>
    </aside>
    <main className="intake-main">
      <header className="intake-topbar"><button className="intake-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="intake-breadcrumb"><span>Workspace</span><ChevronRight size={14}/><strong>My created inquiries</strong></div><div className="intake-top-tools"><label className="intake-global-search"><Search size={17}/><input aria-label="Search inquiries" placeholder="Search inquiries..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}/><kbd>/</kbd></label><button className="intake-icon-button intake-bell" aria-label="Notifications"><Bell size={18}/><i/></button><ThemeToggle className="intake-icon-button"/><div className="intake-profile-menu-wrap"><button className="intake-top-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span><strong>{user?.fullName ?? "Staff"}</strong><small>Intake Staff</small></span><ChevronDown size={15}/></button>{profileOpen && <div className="intake-profile-dropdown"><strong>{user?.fullName ?? "Staff"}</strong><small>{user?.email ?? ""}</small><button onClick={() => void logout()}><LogOut size={14}/> Log out</button></div>}</div></div></header>
      <div className="intake-content all-inquiries-content">
        <div className="intake-heading"><div><p className="intake-kicker">INQUIRY WORKSPACE</p><h1>My created inquiries</h1><p>View and monitor the inquiries you registered.</p></div><div className="all-inquiries-heading-actions"><span className="all-inquiries-total">{loading ? "Loading…" : `${stats.total.toLocaleString()} inquiries you created`}</span><Link className="intake-create" href="/dashboard/intake/new"><FilePlus2 size={16}/>Create a new inquiry</Link></div></div>
        <section className="intake-stats all-inquiries-stats" aria-label="Inquiry statistics">
          <article><div className="intake-stat-head"><span className="intake-stat-icon teal"><ClipboardList size={18}/></span><span className="intake-stat-note teal-note">All records</span></div><small>Total inquiries</small><strong>{loading ? "—" : stats.total.toLocaleString()}</strong><p>In your authorized scope</p></article>
          <article><div className="intake-stat-head"><span className="intake-stat-icon blue"><Inbox size={18}/></span><span className="intake-stat-note blue-note">Needs review</span></div><small>New inquiries</small><strong>{loading ? "—" : stats.new_count.toLocaleString()}</strong><p>Awaiting a handler</p></article>
          <article><div className="intake-stat-head"><span className="intake-stat-icon amber"><Activity size={18}/></span><span className="intake-stat-note amber-note">Being handled</span></div><small>In progress</small><strong>{loading ? "—" : stats.in_progress.toLocaleString()}</strong><p>Currently being handled</p></article>
          <article><div className="intake-stat-head"><span className="intake-stat-icon green"><CheckCircle2 size={18}/></span><span className="intake-stat-note green-note">Completed</span></div><small>Resolved</small><strong>{loading ? "—" : stats.resolved.toLocaleString()}</strong><p>Successfully closed</p></article>
        </section>
        <section className="intake-table-panel all-inquiries-panel">
          <div className="intake-panel-head"><div><p className="intake-kicker">REGISTERED INQUIRIES</p><h2>Inquiry directory <span>{loading ? "…" : total}</span></h2><p>Search and monitor inquiries you are authorized to access.</p></div></div>
          <div className="all-inquiries-toolbar">
            <label className="intake-table-search all-search"><Search size={16}/><input placeholder="Search by inquiry ID, customer name, subject or contact..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }}/>{search && <button aria-label="Clear search" onClick={() => { setSearch(""); setPage(1); }}><X size={15}/></button>}</label>
            <label><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{statusValues.map((value) => <option key={value} value={value}>{readableLabel(value)}</option>)}</select></label>
            <label><span>Category</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{categories.map((item) => <option key={item.name} value={item.name}>{readableLabel(item.name)}</option>)}</select></label>
            <label><span>Dates</span><select value={datePreset} onChange={(event) => { setDatePreset(event.target.value); setPage(1); }}><option value="ALL">All dates</option><option value="TODAY">Today</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="CUSTOM">Custom range</option></select></label>
            <label><span>Assignment</span><select value={assignment} onChange={(event) => { setAssignment(event.target.value); setPage(1); }}><option value="ALL">All inquiries</option><option value="ASSIGNED">Assigned</option><option value="UNASSIGNED">Unassigned</option></select></label>
            {filteredLabel && <button className="all-reset" onClick={resetFilters}><FilterX size={15}/>Reset filters</button>}
          </div>
          {datePreset === "CUSTOM" && <div className="all-date-range"><label><CalendarDays size={14}/><span>From</span><input type="date" value={range.from} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }}/></label><label><CalendarDays size={14}/><span>To</span><input type="date" value={range.to} min={range.from || undefined} onChange={(event) => { setDateTo(event.target.value); setPage(1); }}/></label></div>}
          {error ? <div className="intake-empty all-state"><CircleHelp size={23}/><strong>Inquiries are unavailable</strong><p>{error}</p><button onClick={() => { setLoading(true); void loadInquiries(); }}>Retry</button></div> : loading ? <div className="all-loading" aria-label="Loading inquiries"><span/><span/><span/><span/><span/></div> : !inquiries.length ? <div className="intake-empty all-state"><Inbox size={25}/><strong>{filteredLabel ? "No matching inquiries found" : "No inquiries found"}</strong><p>{filteredLabel ? "Try changing your search or filters." : "Customer inquiries will appear here once registered."}</p>{filteredLabel && <button onClick={resetFilters}>Clear filters</button>}</div> : <div className="intake-table-scroll all-table-scroll"><table><thead><tr><th>INQUIRY ID</th><th>CUSTOMER</th><th>SUBJECT</th><th>CATEGORY</th><th>CONTACT</th><th>ASSIGNED STAFF</th><th>CREATED DATE</th><th>STATUS</th><th>ACTIONS</th></tr></thead><tbody>{inquiries.map((item) => <tr key={item.id}><td><span className="intake-ref">{inquiryReference(item.id)}</span></td><td><span className="intake-customer"><i>{initials(item.customer_name)}</i><strong>{item.customer_name}</strong></span></td><td className="intake-subject">{item.subject}</td><td><span className="category-label">{readableLabel(item.category)}</span></td><td className="intake-contact">{item.contact || "—"}</td><td>{(item.assigned_staff_name || item.assigned_to || item.assignment_status === "ASSIGNED") ? <span className="intake-assignee"><i>{initials(item.assigned_staff_name ?? "Handler")}</i>{item.assigned_staff_name ?? (item.assigned_to ? `Staff #${item.assigned_to}` : "Assigned")}</span> : <span className="intake-unassigned">Unassigned</span>}</td><td>{displayDate(item.created_at)}</td><td><span className={`intake-status status-${item.status.toLowerCase()}`}><i/>{readableLabel(item.status)}</span></td><td><button className="intake-view" aria-label={`View details for ${inquiryReference(item.id)}`} onClick={() => void viewDetails(item)}><Eye size={16}/></button></td></tr>)}</tbody></table></div>}
          {!error && !loading && <div className="all-pagination"><span>Showing <strong>{startRow}–{endRow}</strong> of <strong>{total}</strong> inquiries</span><div><label>Rows <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label><button aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={16}/></button><span>Page <strong>{page}</strong> of {totalPages}</span><button aria-label="Next page" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}><ChevronRight size={16}/></button></div></div>}
        </section>
      </div>
    </main>
    {(selected || detailLoading) && <div className="intake-modal-backdrop" role="presentation" onClick={() => { if (!detailLoading) setSelected(null); }}>{detailLoading ? <section className="intake-modal" role="status">Loading inquiry details…</section> : selected && <section className="intake-modal all-detail-modal" role="dialog" aria-modal="true" aria-labelledby="all-detail-title" onClick={(event) => event.stopPropagation()}><div className="intake-modal-title"><div><p className="intake-kicker">INQUIRY DETAILS</p><h2 id="all-detail-title">{inquiryReference(selected.id)}</h2></div><button aria-label="Close details" onClick={() => setSelected(null)}><X size={19}/></button></div><div className="intake-modal-customer"><i>{initials(selected.customer_name)}</i><div><strong>{selected.customer_name}</strong><small>{selected.contact || "Customer contact unavailable"}</small></div></div><div className="all-detail-description"><strong>Inquiry description</strong><p>{selected.description || "No description provided."}</p></div><dl><div><dt>Subject</dt><dd>{selected.subject}</dd></div><div><dt>Category</dt><dd>{readableLabel(selected.category)}</dd></div><div><dt>Assigned handler</dt><dd>{selected.assigned_staff_name ?? (selected.assigned_to ? `Staff #${selected.assigned_to}` : selected.assignment_status === "ASSIGNED" ? "Assigned" : "Unassigned")}</dd></div><div><dt>Created</dt><dd>{displayDate(selected.created_at)}</dd></div><div><dt>Current status</dt><dd><span className={`intake-status status-${selected.status.toLowerCase()}`}>{readableLabel(selected.status)}</span></dd></div></dl><section className="all-history"><h3>Inquiry history</h3>{history.length ? history.map((event) => <article key={event.id}><span className="all-history-dot"/><div><strong>{event.action === "CREATED" ? "Inquiry created" : event.action === "ASSIGNED" ? "Handler assigned" : event.action === "STATUS_CHANGED" ? `Status changed${event.new_value ? ` to ${readableLabel(event.new_value)}` : ""}` : readableLabel(event.action)}</strong><p>{event.changed_by_name ? `By ${event.changed_by_name}` : "System update"}{event.old_value && event.new_value && event.action === "STATUS_CHANGED" ? ` · ${readableLabel(event.old_value)} → ${readableLabel(event.new_value)}` : ""}</p><small>{displayTimestamp(event.created_at)}</small></div></article>) : <p>No history is available for this inquiry.</p>}</section><button className="intake-modal-done" onClick={() => setSelected(null)}>Done</button></section>}</div>}
  </div>;
}
