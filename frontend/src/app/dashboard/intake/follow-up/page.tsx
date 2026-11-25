"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, FilePlus2, FilterX, LayoutDashboard, LogOut, Menu, MessageCircle, Search, Settings, X } from "lucide-react";
import ThemeToggle from "../../../../components/ThemeToggle";
import { useInquiryRefresh } from "../../../../lib/useInquiryRefresh";
import { useLogout } from "../../../../lib/useLogout";
import LogoutFeedback from "../../../../components/LogoutFeedback";
import "../intake.css";

type User = { id: number; fullName: string; email: string; role: string };
type Inquiry = { id: number; customer_name: string; subject: string; status: "NEW" | "IN_PROGRESS" | "RESOLVED"; created_at: string; resolved_at?: string | null; customer_informed?: boolean };
type ApiResult<T> = { success?: boolean; data?: T; message?: string };
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";
const initials = (name: string) => name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
const dateLabel = (value?: string | null) => { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date); };
const reference = (id: number) => `CN-${String(id).padStart(4, "0")}`;

export default function IntakeFollowUpPage() {
  const router = useRouter();
  const { logout, error: logoutError } = useLogout();
  const [user, setUser] = useState<User | null>(null);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [informedFilter, setInformedFilter] = useState("ALL");
  const [mobileNav, setMobileNav] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const loadInquiries = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl}/api/inquiries`, { credentials: "include" });
      const result = await response.json() as ApiResult<Inquiry[]>;
      if (!response.ok || !result.success) throw new Error(result.message ?? "Could not load resolved inquiries.");
      setInquiries((result.data ?? []).filter((item) => item.status === "RESOLVED"));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load resolved inquiries."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => void (async () => {
      try {
        const response = await fetch(`${apiUrl}/api/auth/me`, { credentials: "include" });
        const result = await response.json() as { user?: User };
        if (!response.ok || !result.user) { router.replace("/"); return; }
        if (result.user.role !== "INTAKE") { router.replace(result.user.role === "ADMIN" ? "/dashboard/admin" : "/dashboard/handler"); return; }
        if (active) setUser(result.user);
        await loadInquiries();
      } catch (cause) { if (active) { setError(cause instanceof Error ? cause.message : "Could not load resolved inquiries."); setLoading(false); } }
    })(), 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [loadInquiries, router]);

  useInquiryRefresh(loadInquiries);

  const filteredInquiries = useMemo(() => {
    const term = search.trim().toLowerCase();
    return inquiries.filter((item) => {
      const matchesSearch = !term || [reference(item.id), item.id, item.customer_name, item.subject].some((value) => String(value).toLowerCase().includes(term));
      const matchesStatus = informedFilter === "ALL" || (informedFilter === "INFORMED" ? Boolean(item.customer_informed) : !item.customer_informed);
      return matchesSearch && matchesStatus;
    });
  }, [inquiries, informedFilter, search]);

  async function markInformed(inquiry: Inquiry) {
    const informed = !inquiry.customer_informed;
    setSavingId(inquiry.id); setError("");
    try {
      const response = await fetch(`${apiUrl}/api/inquiries/${inquiry.id}/customer-informed`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ informed }) });
      const result = await response.json() as ApiResult<{ customer_informed: boolean }>;
      if (!response.ok || !result.success) throw new Error(result.message ?? "Could not update customer notification status.");
      setInquiries((current) => current.map((item) => item.id === inquiry.id ? { ...item, customer_informed: result.data?.customer_informed ?? informed } : item));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update customer notification status."); }
    finally { setSavingId(null); }
  }

  return <div className="intake-app">
    <LogoutFeedback error={logoutError} onRetry={() => void logout()}/>
    {mobileNav && <button className="intake-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
    <aside className={`intake-sidebar ${mobileNav ? "is-open" : ""}`}>
      <Link href="/dashboard/intake" className="intake-brand"><span className="intake-brand-icon"><img src="/cofee.png" alt="" /></span><span><small>INQUIRY PORTAL</small></span><button className="intake-close" aria-label="Close menu" onClick={(event) => { event.preventDefault(); setMobileNav(false); }}><X size={18}/></button></Link>
      <div className="intake-nav-label">WORKSPACE</div>
      <nav className="intake-nav" aria-label="Main navigation">
        <Link href="/dashboard/intake"><LayoutDashboard size={18}/>Dashboard</Link>
        <Link href="/dashboard/intake/new"><FilePlus2 size={18}/>New inquiry</Link>
        <Link href="/dashboard/intake/inquiries"><ClipboardList size={18}/>My created inquiries</Link>
        <Link className="current" aria-current="page" href="/dashboard/intake/follow-up"><MessageCircle size={18}/>Customer follow-up</Link>
        <Link href="/dashboard/intake/notifications"><Bell size={18}/>Notifications</Link>
      </nav>
      <div className="intake-nav-label settings-label">PREFERENCES</div><nav className="intake-nav"><Link href="/dashboard/intake/settings"><Settings size={18}/>Settings</Link></nav>
      <div className="intake-sidebar-profile"><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span className="intake-profile-name"><strong>{user?.fullName ?? "Intake Staff"}</strong><small>Intake Staff</small></span><button className="intake-logout intake-logout-labeled" title="Log out" aria-label="Log out" onClick={() => void logout()}><LogOut size={16}/><span>Log out</span></button></div>
    </aside>
    <main className="intake-main">
      <header className="intake-topbar"><button className="intake-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20}/></button><div className="intake-breadcrumb"><span>Workspace</span><ChevronRight size={14}/><strong>Customer follow-up</strong></div><div className="intake-top-tools"><Link className="intake-icon-button intake-bell" aria-label="Notifications" href="/dashboard/intake/notifications"><Bell size={18}/></Link><ThemeToggle className="intake-icon-button"/><div className="intake-profile-menu-wrap"><button className="intake-top-profile" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><span className="intake-avatar">{initials(user?.fullName ?? "Staff")}</span><span><strong>{user?.fullName ?? "Staff"}</strong><small>Intake Staff</small></span><ChevronDown size={15}/></button>{profileOpen && <div className="intake-profile-dropdown"><strong>{user?.fullName ?? "Staff"}</strong><small>{user?.email ?? ""}</small><button onClick={() => { setProfileOpen(false); void logout(); }}><LogOut size={14}/> Log out</button></div>}</div></div></header>
      <div className="intake-content intake-followup-content">
        <div className="intake-heading"><div><p className="intake-kicker">CUSTOMER FOLLOW-UP</p><h1>Resolved inquiries</h1><p>Track whether each customer has been informed about their resolution.</p></div><Link className="intake-create" href="/dashboard/intake/inquiries"><ClipboardList size={16}/>My created inquiries</Link></div>
        <section className="intake-table-panel intake-resolved-panel" aria-label="Resolved inquiries follow-up"><div className="intake-panel-head"><div><p className="intake-kicker">RESOLUTION TRACKER</p><h2>Customer notification status <span>{loading ? "—" : filteredInquiries.length}{!loading && filteredInquiries.length !== inquiries.length ? ` / ${inquiries.length}` : ""}</span></h2><p>Use the action to update the customer follow-up status.</p></div></div>
          <div className="intake-filters followup-filters"><label className="intake-table-search"><Search size={16}/><input aria-label="Search resolved inquiries" placeholder="Search by customer, subject or inquiry ID" value={search} onChange={(event) => setSearch(event.target.value)}/>{search && <button aria-label="Clear search" onClick={() => setSearch("")}><X size={14}/></button>}</label><label><span className="sr-only">Filter by customer informed status</span><select value={informedFilter} onChange={(event) => setInformedFilter(event.target.value)}><option value="ALL">All follow-up statuses</option><option value="NOT_INFORMED">Not informed</option><option value="INFORMED">Informed</option></select></label>{(search || informedFilter !== "ALL") && <button className="followup-clear-filter" onClick={() => { setSearch(""); setInformedFilter("ALL"); }}><FilterX size={14}/>Clear filters</button>}</div>
          {error && <p className="intake-followup-error" role="alert">{error}</p>}
          {loading ? <div className="intake-empty">Loading resolved inquiries…</div> : !inquiries.length ? <div className="intake-empty"><CheckCircle2 size={24}/><strong>No resolved inquiries yet</strong><p>Resolved cases will appear here for customer follow-up.</p></div> : !filteredInquiries.length ? <div className="intake-empty"><Search size={22}/><strong>No matching inquiries</strong><p>Try a different search or follow-up status.</p></div> : <div className="intake-table-scroll"><table><thead><tr><th>INQUIRY ID</th><th>CUSTOMER</th><th>SUBJECT</th><th>RESOLVED</th><th>CUSTOMER INFORMED</th><th>ACTION</th></tr></thead><tbody>{filteredInquiries.map((item) => <tr key={item.id}><td><span className="intake-ref">{reference(item.id)}</span></td><td><span className="intake-customer"><i>{initials(item.customer_name)}</i><strong>{item.customer_name}</strong></span></td><td className="intake-subject">{item.subject}</td><td className="intake-created">{dateLabel(item.resolved_at ?? item.created_at)}</td><td><span className={`intake-followup-status ${item.customer_informed ? "is-informed" : "is-not-informed"}`}>{item.customer_informed ? "Informed" : "Not informed"}</span></td><td><button className="intake-followup-button" disabled={savingId === item.id} onClick={() => void markInformed(item)}>{savingId === item.id ? "Saving…" : item.customer_informed ? "Mark not informed" : "Mark informed"}</button></td></tr>)}</tbody></table></div>}
        </section>
        <footer className="intake-footer"><span>Customer Inquiry System</span><span>Keep every customer in the loop.</span></footer>
      </div>
    </main>
  </div>;
}
